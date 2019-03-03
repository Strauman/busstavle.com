Main javascript file is [www/assets/js/maybina.js](https://github.com/Strauman/busstavle.com/tree/master/www/assets/js/maybina.js), css file is [www/assets/css/master.css](https://github.com/Strauman/busstavle.com/tree/master/www/assets/css/master.css) and index in [www/index.html](https://github.com/Strauman/busstavle.com/tree/master/www/index.html).

There is a ruby server in between the javascript and tromskortet. This script is running on [https://www.busstavle.com:4576/departurelist](https://www.busstavle.com:4576/departurelist) (NB: the root path (`busstavle.com:4576/`) just goes back to this repo atm.) using sinatra.
I'll published it when I've finished cleaning the code and such.

Git directory structure
```
Git root
├─ README.md
└─ www
   ├─ assets
   │  ├─ css/master.css
   │  ├─ ding1.mp3
   │  ├─ fonts/digital-7
   │  │  ├─ digital-7 (italic).ttf
   │  │  ├─ digital-7 (mono italic).ttf
   │  │  ├─ digital-7.ttf
   │  │  ├─ mono.ttf
   │  │  └─ readme.txt
   │  └─ js
   │     ├─ cookiehandler.js
   │     ├─ jquery-3.2.0.min.js
   │     ├─ maybina.js
   │     └─ moment.js
   └─ index.html
```
