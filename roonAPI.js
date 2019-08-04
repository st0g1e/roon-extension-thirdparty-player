var RoonApi = require("node-roon-api");
var RoonApiTransport = require("node-roon-api-transport");
var RoonApiStatus = require("node-roon-api-status");
var RoonApiBrowse = require("node-roon-api-browse");
var RoonApiSettings = require('node-roon-api-settings');
var osascript = require('node-osascript');
var fs = require('fs');

const runApplescript = require('run-applescript');
const exec = require('child_process').exec;
const sqlite3 = require('sqlite3').verbose();

//var albumTrackJSON = "album-track.json";
var port = 3001;

// ------ for https --------
var path = require('path');
var transport;

var express = require('express');
var http = require('http');

var app = express();
var server = http.createServer(app);

app.use(express.static(path.join(__dirname, '')));

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.listen(port);

// ----------- DATABASE -----------

var db;

function connectDB() {
  db = new sqlite3.Database('./library.sqlite', sqlite3.OPEN_READONLY, (err) => {
    if (err) {
      console.error(err.message);
    }
    //    console.log('Connected to the roon library database.');
  });
}

function disconnectDB() {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    //    console.log('Close the database connection.');
  });
}


var core;
var zones = [];
var runThirdParty = false;

var lastState = "";
var current_seek = 0;
var lastTrack = "";
var isPlaying = 0;
var player_zone = 0;
var setupTrack = 1;
var tracks = [];
var trackTotalSeek;
var isNextSet = false;
var lockThirdParty = false;
//var lastProcessRun = Math.floor(Date.now() / 1000);

const SEEKMINDIF = 5;
const SEEKMAXDIFF = 10;
const PROCESS_DURATION = 1;

var roon = new RoonApi({
  extension_id: "st0g1e.roon-db",
  display_name: "roon-db",
  display_version: "0.0.1",
  publisher: "bastian ramelan",
  email: "st0g1e@yahoo.com",
  log_level: "none",

  core_paired: function(core_) {
    core = core_;
    core.services.RoonApiTransport.subscribe_zones((response, msg) => {
      if (response == "Subscribed") {
        let curZones = msg.zones.reduce((p, e) => (p[e.zone_id] = e) && p, {});
        zones = curZones;
      } else if (response == "Changed") {
        var z;
        if (msg.zones_removed) msg.zones_removed.forEach(e => delete(zones[e.zone_id]));
        if (msg.zones_added) msg.zones_added.forEach(e => zones[e.zone_id] = e);
        if (msg.zones_changed) msg.zones_changed.forEach(e => zones[e.zone_id] = e);
      }

//      if (runThirdParty == true && lockThirdParty == false && Math.floor(Date.now() / 1000) - lastProcessRun > PROCESS_DURATION) {
      if (runThirdParty == true && lockThirdParty == false) {
//        lastProcessRun = Math.floor(Date.now() / 1000);
//        console.log("run processZones at: " + lastProcessRun);
        processZones(mysettings.thirdZone);
      }

    });
  },

  core_unpaired: function(core_) {

  }
});

// --------------- Settings -----------------------

var zoneName;

var mysettings = roon.load_config("settings") || {
  zoneName: zoneName,
  isThirdPlayer: false,
  thirdPlayerType: 1,
};



function makelayout(settings) {
  var l = {
    values: settings,
    layout: [],
    has_error: false
  };

  let isThirdPlayerZone = {
    type: "dropdown",
    title: "Use Third Party Player",
    values: [{
        title: "No",
        value: false
      },
      {
        title: "Yes",
        value: true
      }
    ],
    setting: "isThirdPlayer"
  };

  l.layout.push(isThirdPlayerZone);

  if (settings.isThirdPlayer == true) {
    let thirdPlayerZone = {
      type: "dropdown",
      title: "Zone for Third Party Player",
      values: [],
      setting: "thirdZone"
    };

    for (var i in zones) {
      if ( !settings.thirdZone ) {
          settings.thirdZone = i;
      }

      thirdPlayerZone.values.push({
        title: zones[i].display_name,
        value: i,
      });
    }

    l.layout.push(thirdPlayerZone);

    let thirdPlayerType = {
      type: "dropdown",
      title: "Third Player Type",
      values: [{
        title: "Audirvana",
        value: 1
      }],
      setting: "thirdPlayerType"
    };

    l.layout.push(thirdPlayerType);
  }
  return l;
}

var svc_settings = new RoonApiSettings(roon, {
  get_settings: function(cb) {
    cb(makelayout(mysettings));
  },

  save_settings: function(req, isdryrun, settings) {
    zoneName = settings.values.thirdZone;
    let l = makelayout(settings.values);
    req.send_complete(l.has_error ? "NotValid" : "Success", {
      settings: l
    });

    if (!isdryrun && !l.has_error) {
      mysettings = l.values;
      runThirdParty = mysettings.isThirdPlayer;

      svc_settings.update_settings(l);
    }
  }
});

var svc_status = new RoonApiStatus(roon);

roon.init_services({
  required_services: [RoonApiTransport, RoonApiBrowse],
  provided_services: [svc_status, svc_settings],
});

svc_status.set_status("Extension enabled", false);
roon.start_discovery();

// ---------------------- API Functions ---------------------

/* ------------Process Zones --------------------------------

[1A]  IF zone's state is different than the last state
[2A]    IF state is "playing"
          set command "playThird"
[2B]    ELSE IF state is "stopped"
          set command "stopThird"
[2C]    ELSE IF state is "paused"
          set command "pauseThird"
[2D]    ENDIF
[1B]  else
[3A]    IF state is "playing"
[4A]      IF same track
            set command "checkSeek"
[4B]      ELSE
            set command "playthird"
[4C]      ENDIF
[3B]    ENDIF
[1C]  ENDIF

--------------------------------------------- */

function processZones(player_zone) {
//  lockThirdParty = true;
  var nextCommand = "";
  if (zones[player_zone].state && zones[player_zone].state != null) {
    if ( zones[player_zone].state != lastState) {
      if (zones[player_zone].state == "playing") {
        if ( lastState == "paused") {
          nextCommand = "resumeThird";
        } else {
          nextCommand = "playThird";
        }
      } else if (zones[player_zone].state == "stopped") {
        nextCommand = "stopThird";
      } else if (zones[player_zone].state == "paused") {
        nextCommand = "pauseThird";
      }
    } else {
      if (zones[player_zone].state == "playing") {
        nextCommand = "playThird";
      }
    }

    lastState = zones[player_zone].state;

    if ( nextCommand == "playThird") {
      playThird(player_zone, function(data) {
        lockThirdParty = false;
      });
    } else if ( nextCommand == "stopThird") {
        stopAudirvana(function(data) {
        lastTrack = "";
        lockThirdParty = false;
      });
    } else if ( nextCommand == "pauseThird") {
        pauseAudirvana(function(data) {
        lockThirdParty = false;
      });
    } else if ( nextCommand == "resumeThird") {
        resumeAudirvana(function(data) {
        lockThirdParty = false;
      });
    }
  }
}

/* ----------------- playthird ------------------

[1A]  CALL third party status (async)
[2A]    IF (third party status != "playing")
[3A]      CALL to play track (async)
[4A]        IF roon'seek > SEEK MIN DIFF
[5A]          CALL set seek on third
[4B]        END IF
[3B]      END CALL
[2B]    ELSE (status = playing)
[6A]      get third party seek (sync)
[7A]        IF current track is the same as last track
              set isNextSet to false
[8A]          IF seek diff > SEEK MAX DIFF
[9A]            CALL to set seek on third (async)
[9B]            END CALL
[8B]          ELSE IF SEEK MIN DIFF < seek diff < SEEK MAX DIFF
                CALL to set seek in roon
[8C]          ENDIF
[7B]        ELSE (new track)
[10A]         IF old duration - third seek < SEEK MIN DIFF (prev track finishes, changed to a new track)
[11A]           IF isNextSet == false
                  CALL nextTrackAudirvana
                  set isNextSet to true
                  set trackTotalSeek to new track's duration
[11B]           END IF
[10B]         ELSE (click new track)
                CALL playTrackAudirvana
                set trackTotalSeek to new track's duration
                set isNextSet to false
[10C]         ENDIF
[7C]        ENDIF
[6B]      END GET
[2C]    ENDIF
[1B]  END CALL

------------------------------------------------ */
function playThird(player_zone) {
  getStatusAudirvana(function(data) {
    status = data;
//    status = data.match(/[A-Za-z]+/);

    if ( status != "Playing") {
      playTrackAudirvana(zones[player_zone].now_playing.three_line.line3, zones[player_zone].now_playing.three_line.line1, function(data) {
        if ( zones[player_zone].now_playing.seek_position > SEEKMINDIF ) {
          setPositionAudirvana(zones[player_zone].now_playing.seek_position, function(data) {
          });
        }

//        lastTrack = zones[player_zone].now_playing.three_line.line1;
        trackTotalSeek = zones[player_zone].now_playing.length;
        isNextSet = false;
      });

      lastTrack = zones[player_zone].now_playing.three_line.line1;
    } else { // status = playing
      getPositionAudirvana(function(data) {
        trackPosition = data;
        if (lastTrack == zones[player_zone].now_playing.three_line.line1) { // same track
          isNextSet = false;

          if ( seekDiff(trackPosition, zones[player_zone].now_playing.seek_position) > SEEKMAXDIFF ) {
            setPositionAudirvana(zones[player_zone].now_playing.seek_position, function(data) {
            });
          } else if ( seekDiff(trackPosition, zones[player_zone].now_playing.seek_position) > SEEKMINDIF) {
//          SET POSITION FOR ROON to trackPosition
          }

          lastTrack = zones[player_zone].now_playing.three_line.line1;
        } else { // change track
          if (trackTotalSeek - trackPosition < SEEKMINDIF) { // roon track finishes, change to new track
            if ( isNextSet == false ) {
              nextTrackAudirvana(zones[player_zone].now_playing.three_line.line3, zones[player_zone].now_playing.three_line.line1, function(data) {
                isNextSet = true;
              });
            }
          } else { // click a new track
            playTrackAudirvana(zones[player_zone].now_playing.three_line.line3, zones[player_zone].now_playing.three_line.line1, function(data) {
//              lastTrack = zones[player_zone].now_playing.three_line.line1;
              trackTotalSeek = zones[player_zone].now_playing.length;
              isNextSet = false;
            });
          }

          lastTrack = zones[player_zone].now_playing.three_line.line1;
        }
      });
    }
  });
}

// -------------------- THIRD PARTY FUNCTIONS ------------------------------------

// Audirvana

function playTrackAudirvana(album, track, callback) {
  getByAlbumTrack(album, track, function(data) {
    var command = "tell application \"Audirvana\" to set playing track type AudioFile URL \"file://" + data[0].path + "\"";
    runExternal(command, function(data) {

      getStatusAudirvana(function(data) {
        if (data != "Playing") {
          playpauseAudirvana();
        }
      });
    });

    lockThirdParty = false;
  });
}

function nextTrackAudirvana(album, track, callback) {
  getByAlbumTrack(album, track, function(data) {
    var command = "tell application \"Audirvana\" to set next track type AudioFile URL \"file://" + data[0].path + "\"";
    runExternal(command, function(data) { });
  });
}

function playpauseAudirvana(callback) {
  var command = "tell application \"Audirvana\" to playpause";
  runExternal(command, function(data) { });
}

function previousAudirvana(callback) {
  var command = "tell application \"Audirvana\" to back track";
  runExternal(command, function(data) { });
}

function pauseAudirvana(callback) {
  var command = "tell application \"Audirvana\" to pause";
  runExternal(command, function(data) { });
}

function stopAudirvana() {
  var command = "tell application \"Audirvana\" to stop";
  runExternal(command, function(data) { });
}

function resumeAudirvana() {
  var command = "tell application \"Audirvana\" to resume";
  runExternal(command, function(data) { });
}

function getPositionAudirvana(callback) {
  var command = "tell application \"Audirvana\" to return player position";
  runExternal(command, function(data) {
    callback(data);
  });
}

function setPositionAudirvana(newPosition, callback) {
  var command = "tell application \"Audirvana\" to set player position to " + newPosition;
  runExternal(command, function(data) { });
}

function seekDiff(one, two) {
  toReturn = 0;
  if ( one - two > 0 ) {
    toReturn = one - two;
  } else {
    toReturn = two - one;
  }

  return toReturn;
}

function getStatusAudirvana(callback) {
  var command = "tell application \"Audirvana\" to return player state";
  runExternal(command, function(data) {
    if ( data != null ) {
      data = data.match(/[A-Za-z]+/);
    }

    callback(data);
  });
}

function runExternal(scriptToRun, callback) {
  osascript.execute(scriptToRun, function(err, result, raw) {
    if (err) return console.error(err)
    callback(result);
  });
}

function getByAlbumTrack(album, title, callback) {
  connectDB();

  let sql = "SELECT description as text, id, path, children, artist, album, disc, title, level from roonLib where album = \"" + album + "\" and title=\"" + title + "\"";

  db.serialize(function() {
    db.all(sql, function(err, allRows) {

      if (err != null) {
        console.log(err);
        callback(err);
      }

      callback(allRows);
    });
  });

  disconnectDB();
}

//---------------- Database --------------------------------------------

function jsParentLevel(parentId, callback) {
  let sql = "SELECT description as text, id, children, path, artist, album, disc, title, level from roonLib where parent = " + parentId + " order by id";
  var toReturn = "";

  db.serialize(function() {
    db.all(sql, function(err, allRows) {

      if (err != null) {
        console.log(err);
        callback(err);
      }

      callback(allRows);
    });
  });

  return toReturn;
}

app.get('/roonAPI/getNodeById', function(req, res) {
  getNodeById(req.query['id'], function(data) {
    res.send({
      "status": data
    })
  });
});

function getNodeById(id, callback) {
  connectDB();

  let sql = "SELECT searchText as text, id, path, children, artist, album, disc, title, level from roonLib where id = " + id;

  db.serialize(function() {
    db.all(sql, function(err, allRows) {

      if (err != null) {
        console.log(err);
        callback(err);
      }

      callback(allRows);
    });
  });

  disconnectDB();
}

app.get('/roonAPI/listByLevel', function(req, res) {
  connectDB();

  let sql = "SELECT description as text, id, path, children, artist, album, disc, title, level from roonLib where level = \'" + req.query['level'] + "\' order by id";
  db.serialize(function() {
    db.all(sql, function(err, allRows) {

      if (err != null) {
        console.log(err);
        callback(err);
      }

      res.send({
        "status": allRows
      })

    });
  });

  disconnectDB();
});

app.get('/roonAPI/getJSTreeByParent', function(req, res) {
  var toReturn;
  connectDB();

  jsParentLevel(req.query['id'], function(callback) {
    for (i = 0; i < callback.length; i++) {
      if (callback[i].children == 1) {
        callback[i].children = true;
      } else {
        callback[i].children = false;
      }

      if (callback[i].level.search(/(albums)/i) >= 0) {

        callback[i].text = callback[i].text +
          " ( <a href=\"javascript:void(0);\" onclick=\"play(" +
          +callback[i].id +
          ");\">play<\/a> )";
      }
    }
    res.send({
      "status": callback
    })
  });

  disconnectDB();
});

app.get('/roonAPI/getTree', function(req, res) {
  var toReturn;

  var contents = fs.readFileSync("tree.json");
  var jsonContent = JSON.parse(contents);

  res.send({
    "data": jsonContent
  })
});

// --------------------- Zones
app.get('/roonAPI/listZones', function(req, res) {
  res.send({
    "zones": zones
  })
});

app.get('/roonAPI/getZone', function(req, res) {
  res.send({
    "zone": zones[req.query['zoneId']]
  })
});

// --------------- SEARCH

app.get('/roonAPI/listSearch', function(req, res) {
  refresh_browse(req.query['zoneId'], {
    item_key: req.query['item_key'],
    input: req.query['toSearch'],
    multi_session_key: req.query['multiSessionKey']
  }, 0, 100000, function(myList) {
    res.send({
      "list": myList
    })
  });
});

function listSearch(zoneId, itemKey, toSearch, msk, data) {
  refresh_browse(zoneId, {
    item_key: itemKey,
    input: toSearch,
    multi_session_key: msk
  }, 0, 100000, function(myList) {
    data(myList);
  });
}

function listByItemKey(zoneId, msk, itemKey, data) {
  refresh_browse(zoneId, {
    item_key: itemKey,
    multi_session_key: msk
  }, 0, 500000, function(myList) {
    data(myList);
  });
}

function goHome(zoneId, msk, data) {
  refresh_browse(zoneId, {
    pop_all: true,
    multi_session_key: msk
  }, 1, 100000, function(myList) {
    data(myList);
  });
}

app.get('/roonAPI/play', function(req, res) {
  var id = req.query['id'];
  var zoneId = req.query['zoneId'];
  var multiSessionKey = req.query['msk'];

  searchByNodeID(id, zoneId, multiSessionKey, function(data) {
    listByItemKey(zoneId, multiSessionKey, data[0].item_key, function(data) {
      listByItemKey(zoneId, multiSessionKey, data[0].item_key, function(data) {
        listByItemKey(zoneId, multiSessionKey, data[0].item_key, function(data) {
          listByItemKey(zoneId, multiSessionKey, data[0].item_key, function(data) {
            res.send({
              //              "list": data
              "status": "Success"
            })
          });
        });
      });
    });
  });
});

function searchByNodeID(id, zoneId, msk, callback) {
  var found = 0;

  getNodeById(id, function(data) {
    var toSearch = data[0].text;
    var level = data[0].level;

    //go home first
    goHome(zoneId, msk, function(data) {
      var library_item_key = data[0].item_key;
      listByItemKey(zoneId, msk, library_item_key, function(data) {
        var search_item_key = data[0].item_key;
        listSearch(zoneId, search_item_key, toSearch, msk, function(data) {
          for (i = 0; i < data.length; i++) {
            if (data[i].title == level) {
              found = 1;
              listByItemKey(zoneId, msk, data[i].item_key, function(data) {
                callback(data);
              });
            }
          }

          if (found == 0) {
            callback([{
              'title': 'not found'
            }]);
          }
        });
      });
    });
  });
}

app.get('/roonAPI/searchByNodeID', function(req, res) {
  var id = req.query['id'];
  var zoneId = req.query['zoneId'];
  var multiSessionKey = req.query['msk'];

  searchByNodeID(id, zoneId, multiSessionKey, function(data) {
    res.send({
      "list": data
    })
  });
});

function refresh_browse(zone_id, opts, page, listPerPage, cb) {
  var items = [];
  opts = Object.assign({
    hierarchy: "browse",
    zone_or_output_id: zone_id,
  }, opts);


  core.services.RoonApiBrowse.browse(opts, (err, r) => {
    if (err) {
      console.log(err, r);
      return;
    }

    if (r.action == 'list') {
      page = (page - 1) * listPerPage;

      core.services.RoonApiBrowse.load({
        hierarchy: "browse",
        offset: page,
        count: listPerPage,
        multi_session_key: opts.multi_session_key,
      }, (err, r) => {
        items = r.items;

        cb(r.items);
      });
    }
  });
}


app.get('/roonAPI/getRoonArtists', function(req, res) {
  getRoonData(1, function(data) {
    res.send({
      "list": data
    })
  });
});

app.get('/roonAPI/getRoonAlbums', function(req, res) {
  getRoonData(2, function(data) {
    res.send({
      "list": data
    })
  });
});

app.get('/roonAPI/getRoonTracks', function(req, res) {
  getRoonData(3, function(data) {
    res.send({
      "list": data
    })
  });
});

// LEVEL: 1 = Artists
// LEVEL: 2 = Albums
// LEVEL: 3 = Tracks

function getRoonData(level, callback) {
  var zoneId = Object.keys(zones)[0];
  var msk = (+new Date).toString(36).slice(-5);

  goHome(zoneId, msk, function(data) {
    listByItemKey(zoneId, msk, data[0].item_key, function(data) {
      listByItemKey(zoneId, msk, data[level].item_key, function(data) {
        callback(data);
      });
    });
  });
}
