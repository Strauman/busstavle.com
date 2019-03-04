#!/usr/bin/env ruby
# Include bundler and stuff
require 'rubygems'
require 'bundler/setup'
require 'yaml'
Bundler.require(:default)
# SSL is managed by server. Requests are proxy passed internally.
# Production should set rack environment production.
Bundler.require(:development) if development?
# Bind to all addresses
set :bind, '0.0.0.0'
# TODO: move config to file
config = { allowed_cross_origins: ['localhost.int', 'busstavle.com', 'genistrek.com'] }
# Cookies aren't working as expected. Yet.
set(:cookie_options) do
  { httponly: false }
end
if development?
  p 'FOUND IS_LOCAL VARIABLE'
  p 'Port 4576'
  set :port, 4576
else
  p "DIDN'T FIND IS_LOCAL VARIABLE"
  p 'Port 4567'
  set :port, 4567
end

# Query tromskortet for departures
def get_dep_query_url(**opts)
  bus_url = URI.parse('https://rp.tromskortet.no/scripts/TravelMagic/TravelMagicWE.dll/v1DepartureSearchXML?realtime=1')
  bus_url.query = [bus_url.query, opts.map { |k, v| "#{k}=#{v}" }.join('&')].compact.join('&')
  bus_url.to_s
end

# Query tromskortet for stop ID based on top name
# Planned to be used as autocomplete for stops later
def get_stopnum_query(query_stop)
  base_url = URI.parse('https://rp.tromskortet.no/scripts/TravelMagic/TravelMagicWE.dll/StageJSON')
  base_url.query = [base_url.query, "query=#{query_stop}"].compact.join('&')
  base_url.to_s
  # Example:
  # https://rp.tromskortet.no/scripts/TravelMagic/TravelMagicWE.dll/svar?dep1=1&from=Tromsdalen+kirke+(Troms%C3%B8)+%5Bhpl.gruppe%5D&direction=1&date=23.02.2019&time=11%3A52&through=&throughpause=&lang=no&referrer=www.tromskortet.no
end

# Get the best match for a stop name
def get_best_suggestion_stop(query_stop)
  response = open(get_stopnum_query(query_stop), &:read)
  resp = JSON.parse(response)
  resp['suggestions'][0].to_s
end

# Add ensure_array method do misc classes
class Object; def ensure_array
                [self]
              end end
class Array; def ensure_array
               to_a
             end end
class NilClass; def ensure_array
                  to_a
                end end
# XML tags from tromskortet that contains notes
$notes_tags = %w[notes fromnotes tonotes] # Don't know if "tonotes" is a thing or not

def reformat_departures(deps)
  # Departures comes in XML from tromskortet
  # See e.g. https://rp.tromskortet.no/scripts/TravelMagic/TravelMagicWE.dll/v1DepartureSearchXML?realtime=1&from=UiT%20(Troms%C3%B8)
  # This function handles the response after it's been parsed by Crack
  out_departures = []
  deps.each do |d|
    this_notes = []
    # First extract notes
    $notes_tags.each do |nt|
      next unless d.key? nt
      note_arr = d[nt]['i'].ensure_array
      note_arr.each do |note|
        this_notes << {
          msg: note['d'],
          type: note['st'],
          severity: note['sv']
        }
      end
    end
    dep_entry = {
      std: d['d'], # 'd' tag is departure
      sta: d['a'], # arrival
      line: d['l'], # line
      stopnr: d.key?('stopnr') ? d['stopnr'] : -1,
      # "d2" is estimated departure time. "a2" Estimated arrival.
      # Not provided on non-live departures
      etd: d.key?('d2') ? d['d2'] : d['d'],
      eta: d.key?('a2') ? d['a2'] : d['a'],
      towards: d['nd'], # 'nd' named direction (?)
      live: (d.key? 'd2'),
      notes: this_notes
    }
    out_departures << dep_entry
  end
  out_departures
end

get '/' do
  redirect 'https://github.com/Strauman/busstavle.com'
end

# Set cookie to hide user from google analytics
# (however cookies does not work as expected. yet.)
get '/excludeme' do
  content_type 'text/plain'
  return 'Already excluded' if cookies[:ghost]
  cookies[:ghost] = 'true'
  return "You're now a ghost to analysis"
end

before do
  # Allow cross origin according to config
  request_origin = request.env['HTTP_ORIGIN']
  # First check if localhost
  # p request_origin
  # if false && (/(?:https?:\/\/)?localhost[^\.]/ =~ request_origin)
  #   p "LOCALHOST"
  #
  # end
  # else
    # Origin domains
    parsed_domain = /(?:https?:\/\/)?([^\/:$]+)+(?:\:[0-9]+)?/.match(request_origin)
    if parsed_domain.captures[0]=="localhost"
      p "LOCAL"
      headers 'Access-Control-Allow-Origin' => '*'
    else
      domain_parts = /(.*?)([^\.]+)\.([^\.]+)$/.match(parsed_domain.captures[0])
      headers 'Access-Control-Allow-Origin' => '*'
      # domain and TLD (not subdomains)
      dtld = "#{domain_parts[-2]}.#{domain_parts[-1]}"
      if config[:allowed_cross_origins].include? dtld
        headers 'Access-Control-Allow-Origin' => '*'
      end
    end
  # end
end

get '/departurelist' do
  content_type 'text/plain'
  # Load XML from tromskortet based on parameters and
  # make a more readable result
  q = if params['stop_name']
        params['stop_name']
      else
        'UiT'
      end
  # Get the full stop name based on query from user
  stop = get_best_suggestion_stop(q)

  # Get url that has to be sent to tromskortet
  load_url = get_dep_query_url ({
    from: stop
  })
  # Read url and parse XML
  web_contents = open(load_url, &:read)
  # Parse response and handle departure entries
  myXML = Crack::XML.parse(web_contents)
  if myXML['result']['departures'].nil?
    return "Could not find any departures:#{web_contents}"
  end
  departures = myXML['result']['departures']['i']
  # Respond to the request
  return {
    departures: reformat_departures(departures),
    stop_name: stop
  }.to_json
end

not_found do
  # If any other things are attempted accessed, then
  # just return status 404 (and not the sinatra standard webpage)
  status 404
end
