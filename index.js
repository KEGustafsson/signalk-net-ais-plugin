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

let vesselArray = {
    20: 'Wing In Ground',
    29: 'Wing In Ground (no other information)',
    30: 'Fishing',
    31: 'Towing',
    32: 'Towing exceeds 200m or wider than 25m',
    33: 'Engaged in dredging or underwater operations',
    34: 'Engaged in diving operations',
    35: 'Engaged in military operations',
    36: 'Sailing',
    37: 'Pleasure',
    40: 'High speed craft',
    41: 'High speed craft carrying dangerous goods',
    42: 'High speed craft hazard cat B',
    43: 'High speed craft hazard cat C',
    44: 'High speed craft hazard cat D',
    49: 'High speed craft (no additional information)',
    50: 'Pilot vessel',
    51: 'SAR',
    52: 'Tug',
    53: 'Port tender',
    54: 'Anti-pollution',
    55: 'Law enforcement',
    56: 'Spare',
    57: 'Spare #2',
    58: 'Medical',
    59: 'RR Resolution No.1',
    60: 'Passenger ship',
    69: 'Passenger ship (no additional information)',
    70: 'Cargo ship',
    71: 'Cargo ship carrying dangerous goods',
    72: 'Cargo ship hazard cat B',
    73: 'Cargo ship hazard cat C',
    74: 'Cargo ship hazard cat D',
    79: 'Cargo ship (no additional information)',
    80: 'Tanker',
    81: 'Tanker carrying dangerous goods',
    82: 'Tanker hazard cat B',
    83: 'Tanker hazard cat C',
    84: 'Tanker hazard cat D',
    89: 'Tanker (no additional information)',
    90: 'Other',
    91: 'Other carrying dangerous goods',
    92: 'Other hazard cat B',
    93: 'Other hazard cat C',
    94: 'Other hazard cat D',
    99: 'Other (no additional information)'
}

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
          .then((res) => {
             return res.json()
        })
        .then((json) => {
          var jsonContent = JSON.parse(JSON.stringify(json));
          var numberAIS = Object.keys(jsonContent.features).length;
          app.debug(numberAIS +' vessel in '+ position_radius +'km radius from vessel');

          for (i = 0; i < numberAIS; i++) {
            var mmsi = jsonContent.features[i].mmsi;
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
	                  value:{mmsi}
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

	          var url ="https://meri.digitraffic.fi/api/v1/metadata/vessels/"+ jsonContent.features[i].mmsi;
        	   fetch(url, { method: 'GET'})
	             .then((res) => {
	                return res.json()
	           })
	           .then((json) => {
	             var jsonContentMeta = JSON.parse(JSON.stringify(json));
	             var destination = jsonContentMeta.destination;
	             var mmsiMeta = jsonContentMeta.mmsi;
	             var callSign = jsonContentMeta.callSign;
	             var imo = jsonContentMeta.imo;
	             var id = jsonContentMeta.shipType;
            	     var shipTypeName = vesselArray[id];
	             var draught = jsonContentMeta.draught;
	             var eta = jsonContentMeta.eta;
	             var posType = jsonContentMeta.posType;
	             var name = jsonContentMeta.name;
                     app.debug('mmsiMeta: '+mmsiMeta);
                     app.debug('destination: '+destination);
                     app.debug('callSign: '+callSign);
                     app.debug('imo: '+imo);
                     app.debug('shipTypeId: '+id);
                     app.debug('shipType: '+shipTypeName);
                     app.debug('draught: '+draught);
                     app.debug('eta: '+eta);
                     app.debug('posType: '+posType);
                     app.debug('nme: '+name);

		        app.handleMessage('net-ais-plugin', {
	                  context: 'vessels.urn:mrn:imo:mmsi:'+mmsiMeta,
		          updates: [
		            {
		              values: [
		                {
		                  path: '',
		                  value:{name}
				},
				{
		                  path: 'navigation.destination',
		                  value:destination
				},
				{
		                  path: 'communication.callsignVhf',
		                  value:callSign
				},
				{
		                  path: 'registrations.imo',
		                  value:imo
				},
				{
		                  path: 'design.aisShipType',
				  value:{"name":shipTypeName,id}
				},
				{
		                  path: 'navigation.destination.eta',
		                  value:eta
				}
		              ]
		            }
		          ]
		        })
	           });

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
