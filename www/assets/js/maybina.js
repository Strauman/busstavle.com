$(function() {
  // Set default values of misc variables
  var stop_name = "UiT (Tromsø)"
  var base_url_match = window.location.href.match(/^(https?:\/\/)?([^\/:]+)/)
  var base_url_host = base_url_match[2]
  var base_url_protocol = base_url_match[1]
  var base_url = base_url_protocol + base_url_host

  var last_update = moment(); // Last time successfully updated from server. Gonna assume we did now to give it time.
  var sinatra_url = base_url + ":4576" // Sinatra URL to fix CORS problems
  var departure_list_url = sinatra_url + "/departurelist"
  var datetime_format = "DD.MM.YYYY HH:mm:ss" //Format for date-times
  var time_format = "HH:mm:ss" //Format for time only
  var m_tomorrow = moment().add(1, 'day').startOf('day'); //Moment for tomorrow - needed to check if departures are today
  var server_update_frequency = 5000; // Interval as to update from server (/tromskortet)
  var countdown_update_interval = 500; // How often to update the countdown timers
  var page_refresh_interval = 3600000; // Refresh page once an hour for sanity
  var assert_server_update_frequency = 5000; // How often to check whether a successfull update from the server has happend
  var assert_server_update_tolerance = 2 * server_update_frequency + 1000; // How long we tolerate not having a successful update before we contact the user


  function add_warning(html, el_id) {
    // Add warning to top of page
    // Don't add a warning if it already exists
    var sel = "#" + el_id
    if ($(sel).length > 0) {
      return;
    }
    var $warning = $("<div></div>");
    $warning.addClass("alert alert-fatal'");
    $warning.prop("id", el_id)
    $warning.html(html);
    $warning.slideUp(0);
    $("#alerts").append($warning);
    $warning.slideDown();
    return $warning;
  }

  function add_or_update_warning(html, el_id) {
    // Create warning on top of page if warning doesn't exist
    // Else update warning page (if it exists)
    var sel = "#" + el_id
    // Don't add a warning if it already exists
    if ($(sel).length <= 0) {
      add_warning(html, el_id);
    } else {
      $(sel).html(html);
    }
    var $warning = $(sel);
    return $warning;
  }

  function remove_warning(el_id) {
    // No point of removing something that is not there
    var sel = "#" + el_id;
    if ($(sel).length <= 0) {
      return;
    }
    $(sel).slideUp(300, function() {
      $(this).remove()
    })
  }

  window.setInterval(function() {
    // Check that we get regular, successful updates from the server
    // or give user a warning so the user won't miss a bus departure.
    var now = moment()
    var diff = now.diff(last_update)
    if (diff > assert_server_update_tolerance) {
      add_or_update_warning("Something seems wrong! Haven't successfully been able to update the buss data since " + last_update.format("HH:mm:ss") + "<br/>Maybe try refreshing the page?", "timeout_warning")
    }
  }, assert_server_update_frequency)

  function parse_query() {
    // Parse the string from the URL and populate the settings
    var url_match = window.location.href.match(/\?(.*)/)
    var query_string = ""
    if (url_match == null || url_match.length == 0) {
      // There no from the user!
      // Show the settings.
      $("#settings").slideDown();
      return
    }
    // Show settings no matter what
    // This is to be removed in a later version, but first need to handle query better
    $("#settings").slideDown();
    query_string = url_match[1]
    var pairs = query_string.split("&")
    var query = {}
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i].split('=');
      query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
    }
    update_settings_from_query(query)
  }

  function update_settings_from_query(query) {
    $("[url_setting]").each(function() {
      setname = $(this).attr("url_setting")
      if (setname in query) {
        switch ($(this).prop("type")) {
          case "checkbox":
            $(this).prop("checked", query[setname] == "1")
            break;
          default:
            $(this).val(query[setname])
        }
      }
    });
  }

  serialize_query = function(obj) {
    // Takes a JS object and returns a URL query string
    // {key1:val1, key2:val2} -> key1=val1&key2=val2
    var str = [];
    for (var p in obj)
      if (obj.hasOwnProperty(p)) {
        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
      }
    return str.join("&");
  }

  function generate_query_string() {
    // Makes a query string from the user settings on the site
    var query = {}
    $("input[url_setting]").each(function() {
      switch ($(this).prop("type")) {
        case "checkbox":
          var cval = "0"
          if ($(this).is(":checked")) {
            cval = "1"
          }
          query[$(this).attr("url_setting")] = cval
          break;
        default:
          if ($(this).val()) {
            query[$(this).attr("url_setting")] = $(this).val()
          }
      }

    });
    return serialize_query(query)
  }

  function update_url_bar() {
    // Updates the query in the URL bar
    var base_url = window.location.href.split('?')[0] // removes query
    // Generate new query
    qstring = generate_query_string()
    window.history.pushState(null, null, base_url + "?" + qstring);
  }

  parse_query()
  var loaded_departures = false;

  function tcells() {
    // Short cut to make table cells for a row
    row = []
    for (cell_i in arguments) {
      var $cell = $("<td></td>");
      row.push($cell.html(arguments[cell_i]))
    }
    return row
  }
  window.bus_counts = []

  function on_ding() {
    // Callback to execute when "dinging" happens.
    //
    var m_dingafter, ding_now = true;
    if ($("#dingdelay").val()) {
      m_dingafter = moment($("#dingdelay").val(), "HH:mm")
      if (m_dingafter.isValid() && moment() < m_dingafter) {
        ding_now = false;
      }
    }
    if ($('#do_ding').is(":checked") && ding_now) {
      var audio = new Audio('assets/ding1.mp3');
      audio.play();
    }
  }

  function unding() {
    // Callback to action when ding is done
  }

  function get_daystring(mom) {
    // Decides whether to write day or days
    var daystr = "day";
    if (parseInt(mom.format("DD")) > 1) {
      daystr += "s";
    }
    return daystr
  }

  function update_countdowns(repeat, cb) {
    // Updates countdown timer in tables
    $(".countdown").each(function() {
      end_datetime = $(this).attr("end_datetime");
      end_moment = moment(end_datetime, datetime_format)
      diff = end_moment.diff(moment());
      var dingdiff = moment.duration("00:" + $("#dingtime").val()).asMilliseconds()
      if (diff < dingdiff && !$(this).hasClass("ding")) {
        $(this).addClass("ding");
        if (cb) {
          on_ding();
        }
      } else if (diff >= dingdiff && $(this).hasClass("ding")) {
        $(this).removeClass("ding")
        if (cb) {
          unding();
        }
      }
      if (diff <= 0) {
        $(this).text("00:00:00");
      } else {
        if (end_moment < m_tomorrow) {
          $(this).text(moment.utc(diff).format("HH:mm:ss"));
        } else {
          var timeto = moment.utc(diff);
          daystr = get_daystring(timeto)
          daystr = parseInt(timeto.format("DD")) + " " + daystr;
          $(this).text(timeto.format("HH:mm:ss") + "+" + daystr);
        }
      }
    });
    if (repeat == true) {
      window.setTimeout(function() {
        update_countdowns(true, true)
      }, countdown_update_interval)
    }
  }
  $("#settings_toggle").click(function() {
    // Show/hide settings
    $("#settings").slideToggle()
  })


  function load_deps() {
    // Manual triggered loading departures
    load_departures()
    loaded_departures = true;
  }
  $("#load_deps").click(load_deps);
  $("#load_deps_form").submit(function(event) {
    event.preventDefault();
    load_deps();
  })
  // Table template for departures
  var dep_table_contents = `<table><thead>
    <tr>
      <th>Linje</th><th>Count down</th><th>Towards</th><th>ETA</th><th>STA</th><th>Spor</th><th>Notes</th>
    </tr>
  </thead>
  <tbody>
  </tbody></table>`

  function $make_div(opts) {
    // Makes and returns a div jQuery object
    var $div = $("<div></div>")
    if (opts['class']) {
      $div.addClass(opts['class'])
    }
    return $div
  }

  $("[url_setting]").each(function() {
    $(this).change(function() {
      update_url_bar()
    })
  })
  var is_loading = false;

  function load_departures() {
    // Function contacting the server, loads departures and parses (much) of the response
    if (is_loading) {
      // If we're already loading, then return (so we don't overload <- pun)
      return;
    }
    is_loading = true;
    // Let google analytics know that the user it still here
    if (window.analytics) {
      gtag('event', "Loaded departures", {
        'non_interaction': true
      });
    }
    update_url_bar()
    if ($("#input_stop_name").val()) {
      stop_name = $("#input_stop_name").val()
    }
    $.ajax({
      dataType: "json",
      url: departure_list_url,
      data: {
        'stop_name': stop_name
      },
      error: function() {
        add_warning("Lost connection to server!", "connection_warning")
      },
      complete: function() {
        is_loading = false;
      },
      success: function(response) {
        // Just successfully heard from the server, so if there is a conneciton
        // warning, it's not needed anymore
        remove_warning("connection_warning")
        // Make a copy of the empty table template
        var $dep_tbl = $(dep_table_contents)
        // Get the departures object
        // TODO: Document response JSON
        // Code for this can be found in communicate.rb
        departures = response["departures"]
        // Update the title
        $("#stop_name").text(response["stop_name"])
        // Keep track of odd an even rows for styling
        var is_even = false
        var odd_even_counter = 0
        // Get the route numbers that we should filter
        //TODO: Send this to server and tromskortet
        var wanted_lines = $("#input_lines").val()
        if (wanted_lines) {
          wanted_lines = wanted_lines.split(",")
        }
        for (i in departures) {
          // Iterate departures and insert into table
          var dep = departures[i]
          // Departures has notes sometimes
          var num_notes = dep["notes"].length
          $row = $("<tr></tr>");
          // Get the requested track from user
          //TODO: Send this to server and tromskortet
          var wanted_stopnr = $("#input_track").val();
          // Filter out if this current departure does not have the wanted stop
          // or route/line
          var wrong_stop = (wanted_stopnr && (dep["stopnr"] > -1 && dep["stopnr"] != wanted_stopnr))
          var wrong_line = (wanted_lines && !wanted_lines.includes(dep["line"]))
          if (wrong_stop || wrong_line) {
            continue
          }
          is_even = (odd_even_counter % 2 == 0)
          odd_even_counter += 1
          $row.addClass('mainRow')
          var oddeven_class = is_even ? "even" : "odd"
          // Whether or not this departure is in "real time" (sanntid)
          var is_live = dep["live"]
          if (!dep["live"]) {
            $row.addClass("notlive")
          }
          $row.addClass(oddeven_class)
          // Get estimated and scheduled time of arrival
          // (There are also departure times (etd and std) available)
          var m_eta = moment(dep["eta"], datetime_format)
          var m_sta = moment(dep["sta"], datetime_format)
          var dep_time_format = time_format
          if (m_eta > m_tomorrow) {
            // If departure is tomorrow, we shold write that
            dep_time_format = datetime_format
          }
          var eta_html;
          if (!dep["live"]) {
            eta_html = "<span class='small'>Not realtime<span>"
          } else {
            var $eta_div = $make_div({
              'class': "timefont"
            })
            $eta_div.html(m_eta.format(dep_time_format))
            eta_html = $eta_div
          }
          var $sta_div = $make_div({
            'class': "timefont"
          });
          $sta_div.html(m_sta.format(dep_time_format))
          sta_html = $sta_div
          // Put the end datetime in the attributes for the
          // countdown updater to figure out how long it is left
          var countdown_htm = "<div end_datetime='" + dep["eta"] + "' class='countdown timefont'></div>"
          // Make the row for this departure
          $row_cells = tcells(dep["line"], countdown_htm, dep['towards'], eta_html, sta_html, dep["stopnr"])
          if (num_notes > 0) {
            // Add the first note. Bad design choice.
            // The rest will be added using rowspan.
            // This whole thing should probably be done using unordered lists (<ul>)
            var $note_cell = $("<td></td>");
            $note_cell.addClass("notecell");
            $note_cell.text(dep["notes"][0]["msg"])
            $row_cells.push($note_cell)
          } else {
            $row_cells = $row_cells.concat(tcells(""))
          }
          // Add the row to the table copy
          $('tbody', $dep_tbl).append($row);
          // Do the rowspanthing mentioned above
          if (num_notes > 1) {
            for (k in $row_cells) {
              if (k < 6) {
                // 6 magic number is number of columns in table
                cell = $row_cells[k]
                cell.attr("rowspan", num_notes)
              }
            }
          }
          for (j in dep["notes"]) {
            if (j == 0) {
              // Skip the firts note (because it's already in there)
              continue;
            }
            // Add the actual row
            var $note_row = $("<tr></tr>");
            var $note_cell = $("<td></td>");
            $note_cell.addClass("notecell");
            $note_cell.text(dep["notes"][j]["msg"])
            $note_row.addClass("note_row");
            $note_row.addClass(oddeven_class);
            if (!is_live) {
              $note_row.addClass(".notlive")
            }
            $note_row.append($note_cell);
            // Add the note row at the bottom of the table
            $('tbody tr:last', $dep_tbl).after($note_row);
          }
          $row.append($row_cells);
        }
        // Add the entire table to the DOM
        $('#departure_table').html($dep_tbl.html())
        // Run countdown update (to avoid "downtime")
        update_countdowns(false, false)
        // We got here! That means we got a successful update from the server
        // (This should be verified better though)
        // Write  update time to a hidden div in the DOM
        $("#updated_time").text(moment().format("HH:mm:ss"))
        // Update the last_update variable to contain now.
        last_update = moment();
        remove_warning("timeout_warning");
      }
    });

  }
  // Initial loading
  load_departures()
  update_countdowns(true)
  window.departure_interval = window.setInterval(function() {
    load_departures()
  }, server_update_frequency);
});
