var topUrl = window.location.protocol + "//" + window.location.hostname + ":" + window.location.port;

var zones;
var curZone = "";
var multiSessionKey = (+new Date).toString(36).slice(-5);

function ajax_get(url, callback) {
  xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
      try {
        var data = JSON.parse(xmlhttp.responseText);
      } catch (err) {
        return;
      }

      callback(data);
    }
  };

  xmlhttp.open("GET", url, true);
  xmlhttp.send();
}


// ------------------ Zone

function setupZones() {
  ajax_get(topUrl + '/roonAPI/listZones', function(data) {
    var html = "<h2>Zone List</h2>";
    html += "<ul>";

    var isFirst = 1;
    for (var i in data["zones"]) {
      if (isFirst == 1) {
        curZone = i;
        isFirst = 0;
      }

      html += "<option value=" + data["zones"][i].zone_id + ">" + data["zones"][i].display_name + "</option>\n";
    }
    html += "</ul>";

    document.getElementById("zoneList").innerHTML = html;
  });

  setupTracks();
}

function updateSelected() {
  curZone = document.getElementById("zoneList").value;
}

// ---------------- tracks

function setupTracks() {
  $('#content').jstree({
    'core': {
      'data': function(node, cb) {
        if (node.id === "#") {
          jsonStr = "[{\"text\":\"Directories\",\"id\":0,\"children\":true}]";
          cb(JSON.parse(jsonStr));
        } else {
          if (node.id === "j1_1") {
            ajax_get(topUrl + '/roonAPI/getJSTreeByParent?id=0', function(data) {
              cb(data.status);
            });
          } else {
            ajax_get(topUrl + '/roonAPI/getJSTreeByParent?id=' + node.id, function(data) {
              cb(data.status);
            });
          }
        }
      }
    }
  });
}

function play(id) {
  ajax_get(topUrl + '/roonAPI/play?id=' + id + "&zoneId=" + curZone + "&msk=" + multiSessionKey, function(data) {
  });
}
