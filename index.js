/*
MIT License

Copyright (c) 2020 Karl-Erik Gustafsson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

const fetch = require('node-fetch');

module.exports = function createPlugin(app) {
  const plugin = {};
  plugin.id = 'net-ais-plugin';
  plugin.name = 'Net-AIS';
  plugin.description = 'Marine traffic information is gathered from Finnish Transport Agency’s data sources';

  var position_update = null;
  var position_retention = null;
  var position_radius = null;
  var url;
  var headers;
  var headers = '{ "accept": "application/geo+json" }';
  var interval_id1;
  var interval_id2;
  var unsubscribes = [];

plugin.start = function (options, restartPlugin) {

   position_update = options.position_update
   position_retention = options.position_retention
   position_radius = options.position_radius
   app.debug('position_update: '+position_update);
   app.debug('position_retention: '+position_retention);
   app.debug('position_radius: '+position_radius);


   app.debug('Plugin started');
   let localSubscription = {
    context: `vessels.self`,
    subscribe: [{
      path: 'navigation.position.value',
      period: 10000
    }]
  };

  app.subscriptionmanager.subscribe(
    localSubscription,
    unsubscribes,
    subscriptionError => {
      app.error('Error:' + subscriptionError);
    },
    delta => {
      delta.updates.forEach(u => {
        app.debug(u);
      });
    }
  );

  interval_id1 = setInterval(read_info,(5000));
  setTimeout(clear, 5000);
  interval_id2 = setInterval(read_info,(position_update * 60000));

  };

//----------------------------------------------------------------------------
// Clear start interval

  function clear() {
    clearInterval(interval_id1);
  };

//----------------------------------------------------------------------------
// Deg to Rad

function degrees_to_radians(degrees)
{
  var pi = Math.PI;
  return degrees * (pi/180);
}

//----------------------------------------------------------------------------
// Status Array

let statusArray = [
    'under way using engine',
    'at anchor',
    'not under command',
    'restricted maneuverability',
    'constrained by her draught',
    'moored',
    'aground',
    'engaged in fishing',
    'under way sailing',
    'reserved',
    'reserved',
    'power-driven vessel towing astern (regional use)',
    'power-driven vessel pushing ahead or towing alongside (regional use)',
    'reserved',
    'AIS-SART',
    'undefined'
]

//----------------------------------------------------------------------------
// Read and parse AIS data

  read_info = function read_data() {
        var lon = app.getSelfPath('navigation.position.value.longitude');
        var lat = app.getSelfPath('navigation.position.value.latitude');

	var dateobj = new Date( Date.now() - (60000 * position_retention));
        var date = dateobj.toISOString();

        var url = ('https://meri.digitraffic.fi/api/v1/locations/latitude/'+ lat +'/longitude/'+ lon +'/radius/'+ position_radius +'/from/'+ date);
        app.debug(lon, lat, date, position_update, position_retention, position_radius, url, headers);


        fetch(url, { method: 'GET'})
//        fetch(url, { method: 'GET', headers: headers})
          .then((res) => {
             return res.json()
        })
        .then((json) => {
          var jsonContent = JSON.parse(JSON.stringify(json));
          var numberAIS = Object.keys(jsonContent.features).length;
          app.debug(numberAIS +' vessel in '+ position_radius +'km radius from vessel');

          for (i = 0; i < numberAIS; i++) {
            var mmsi = jsonContent.features[i].mmsi;
            var name = mmsi;
	    var latitude = jsonContent.features[i].geometry.coordinates[1];
            var longitude = jsonContent.features[i].geometry.coordinates[0];
            var sog = jsonContent.features[i].properties.sog;
            var cog = degrees_to_radians(jsonContent.features[i].properties.cog);
            var navStat = statusArray[jsonContent.features[i].properties.navStat];
            var rot = degrees_to_radians(jsonContent.features[i].properties.rot);
            var heading = degrees_to_radians(jsonContent.features[i].properties.heading);
            var stampExt = jsonContent.features[i].properties.timestampExternal;
            var stampExt = new Date(stampExt).toISOString();
            var timestamp = stampExt;

	        app.handleMessage('net-ais-plugin', {
                  context: 'vessels.urn:mrn:imo:mmsi:'+mmsi,
	          updates: [
	            {
	              values: [
	                {
	                  path: '',
	                  value:{mmsi, name}
			},
			{
	                  path: 'navigation.position',
	                  value:{longitude,latitude}
			},
			{
	                  path: 'navigation.courseOverGroundTrue',
	                  value:cog
			},
			{
	                  path: 'navigation.speedOverGround',
	                  value:sog
	                },
			{
	                  path: 'navigation.rateOfTurn',
	                  value:rot
	                },
			{
	                  path: 'navigation.headingTrue',
	                  value:heading
	                },
			{
	                  path: 'navigation.state',
	                  value:navStat
	                }
	              ]
	            }
	          ]
	        })


            app.debug('AIS info from: '+ i);
            app.debug('mmsi: '+mmsi);
            app.debug('lat: '+lat);
            app.debug('lon: '+lon);
            app.debug('sog: '+sog);
            app.debug('cog: '+cog);
            app.debug('navStat: '+navStat);
            app.debug('rot: '+rot);
            app.debug('heading: '+heading);
            var stampExt = jsonContent.features[i].properties.timestampExternal;
            var stampExt = new Date(stampExt).toISOString();
            app.debug('timestamp: '+stampExt);
          }
        });
  };

//----------------------------------------------------------------------------

  plugin.stop = function stop() {
    clearInterval(interval_id2);
    unsubscribes.forEach((f) => f());
    unsubscribes = [];
    app.debug('Net-AIS Stopped');
  };

  plugin.schema = {
    type: 'object',
    properties: {
      position_update: {
        type: 'integer',
        default: 1,
        title: 'How often AIS data is fetch (in minutes)',
      },
      position_retention: {
        type: 'integer',
        default: 30,
        title: 'How old AIS data is fetch (minutes from now)',
      },
      position_radius: {
        type: 'integer',
        default: 10,
        title: 'AIS targerts around the vessel (radius in km)',
      },
    },
  };

  return plugin;
};
