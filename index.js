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

const fetchNew = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = function createPlugin(app) {
  const plugin = {};
  plugin.id = 'net-ais-plugin';
  plugin.name = 'Net-AIS';
  plugin.description = 'Marine traffic information is gathered from Finnish Transport Agency’s data sources';

  var position_update = null;
  var position_retention = null;
  var position_radius = null;
  var headers;
  var headers = '{ "accept": "application/geo+json" }';
  var interval_id1;
  var interval_id2;
  var interval_id1A;
  var interval_id2A;
  var unsubscribes = [];
  const setStatus = app.setPluginStatus || app.setProviderStatus;

  plugin.start = function (options, restartPlugin) {
    position_update = options.position_update
    position_retention = options.position_retention
    position_radius = options.position_radius
    app.debug('position_update: ' + position_update);
    app.debug('position_retention: ' + position_retention);
    app.debug('position_radius: ' + position_radius);


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

    interval_id1 = setInterval(read_info, (5000));
    setTimeout(clear1, 5000);
    interval_id2 = setInterval(read_info, (position_update * 60000));

    if (options.atons_data) {
      interval_id1A = setInterval(read_meteo, (5000));    
      setTimeout(clear2, 5000);
      interval_id2A = setInterval(read_meteo, (position_update * 60000));  
    }
  };

  //----------------------------------------------------------------------------
  // Clear start interval

  function clear1() {
    clearInterval(interval_id1);
  };

  function clear2() {
    clearInterval(interval_id1A);
  };

  //----------------------------------------------------------------------------
  // Deg to Rad

  function degrees_to_radians(degrees) {
    var pi = Math.PI;
    return degrees * (pi / 180);
  }

  //----------------------------------------------------------------------------
  // km/h to  knots

  function kmh_to_knots(speed) {
    return speed / 1.852;
  }

  //----------------------------------------------------------------------------
  // draught

  function draught_value(data) {
    return data / 10;
  }

  //----------------------------------------------------------------------------
  // Temperature C to K

  function C_to_K(data) {
    return data + 273.15;
  }

  //----------------------------------------------------------------------------
  // json size
  function lengthInUtf8Bytes(str, str2) {
    // Matches only the 10.. bytes that are non-initial characters in a multi-byte sequence.
    var m = encodeURIComponent(str).match(/%[89ABab]/g);
    return (((str.length + (m ? m.length : 0)) / 1024) + (str2 * 0.2)).toFixed(1);
  }

  //----------------------------------------------------------------------------
  // State Array

  let stateArray = {
    0: 'motoring',
    1: 'anchored',
    2: 'not under command',
    3: 'restricted manouverability',
    4: 'constrained by draft',
    5: 'moored',
    6: 'aground',
    7: 'fishing',
    8: 'sailing',
    9: 'hazardous material high speed',
    10: 'IMO hazard',
    11: 'power-driven vessel towing astern',
    12: 'power-driven vessel pushing ahead or towing alongside',
    13: 'reserved for future use',
    14: 'ais-sart',
    15: 'default'
  }

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

  let locationArray = {
    1: 'GPS',
    2: 'GLONASS',
    3: 'combined GPS/GLONASS',
    4: 'Loran-C',
    5: 'Chayka',
    6: 'integrated navigation system',
    7: 'surveyed',
    8: 'Galileo',
    9: 'not used',
    10: 'not used',
    11: 'not used',
    12: 'not used',
    13: 'not used',
    14: 'not used',
    15: 'internal GNSS'
  }


  //----------------------------------------------------------------------------
  // Read and parse AIS data

  read_meteo = function read_meteo() {
    let date = new Date();
    date.setMinutes(date.getMinutes() - 60);
    let year = date.getFullYear();
    let month = (date.getMonth() + 1).toString().padStart(2, '0');
    let day = date.getDate().toString().padStart(2, '0');
    let hours = date.getHours().toString().padStart(2, '0');
    let minutes = date.getMinutes().toString().padStart(2, '0');
    let seconds = date.getSeconds().toString().padStart(2, '0');
    let formattedDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
    let encodedString = encodeURIComponent(formattedDate);
    var url = ('https://meri.digitraffic.fi/api/sse/v1/measurements?from=' + encodedString);
    fetchNew(url, { method: 'GET' })
      .then((res) => {
        return res.json()
      })
      .then((json) => {
        var jsonContent = json;
        var numberAtoNs = Object.keys(json.features).length;
        for (i = 0; i < numberAtoNs; i++) {
          var id = jsonContent.features[i].properties.siteNumber;
          var mmsi = String(id).padStart(9, '0')
          var latitude = jsonContent.features[i].geometry.coordinates[1];
          var longitude = jsonContent.features[i].geometry.coordinates[0];
          var name = jsonContent.features[i].properties.siteName;
          var type = jsonContent.features[i].properties.siteType;
          var seaState = jsonContent.features[i].properties.seaState;
          var trend = jsonContent.features[i].properties.trend;
          var windWaveDir = degrees_to_radians(jsonContent.features[i].properties.windWaveDir);
          var temperature = C_to_K(jsonContent.features[i].properties.temperature);
          var stampExt = jsonContent.features[i].properties.lastUpdate;
          var timestamp = (new Date(stampExt)).toISOString();
          app.handleMessage('net-ais-plugin', {
            context: 'meteo.urn:mrn:imo:mmsi:' + mmsi,
            updates: [
              {
                values: [
                  {
                    path: '',
                    value: { mmsi }
                  },
                  {
                    path: 'environment.station.siteNumber',
                    value: id
                  },
                  {
                    path: 'navigation.position',
                    value: { longitude, latitude }
                  },
                  {
                    path: '',
                    value: { name }
                  },
                  {
                    path: 'environment.station.type',
                    value: type
                  },
                  {
                    path: 'environment.water.seaState',
                    value: seaState
                  },
                  {
                    path: 'environment.forecast.trend',
                    value: trend
                  },
                  {
                    path: 'environment.wind.directionTrue',
                    value: windWaveDir
                  },
                  {
                    path: 'environment.outside.temperature',
                    value: temperature
                  },
                  {
                    path: 'environment.date',
                    value: timestamp
                  }
                ],
                source: { label: plugin.id },
                timestamp: (new Date().toISOString()),
              }
            ]
          })
          app.debug('Meteo info from: ' + i);
          app.debug('id: ' + mmsi);
          app.debug('lat: ' + latitude);
          app.debug('lon: ' + longitude);
          app.debug('name: ' + name);
          app.debug('type: ' + type);
          app.debug('timestamp: ' + stampExt);
        }
      })
      .catch(error => {
        if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
          console.error(`Error: Could not resolve the address for ${url}. Please check the hostname and try again.`);
        } else {
          console.error('An unexpected error occurred:', error.message || error);
        }
      })
  };

  read_info = function read_data() {
    var lon = app.getSelfPath('navigation.position.value.longitude');
    var lat = app.getSelfPath('navigation.position.value.latitude');
    if (lon && lat) {
      var date = Math.floor(Date.now()) - (60000 * position_retention);
      var url = ('https://meri.digitraffic.fi/api/ais/v1/locations?from=' + date + '&radius=' + position_radius + '&latitude=' + lat + '&longitude=' + lon);
      app.debug(lon, lat, date, position_update, position_retention, position_radius, url, headers);

      fetchNew(url, { method: 'GET' })
        .then((res) => {
          return res.json()
        })
        .then((json) => {
          var dateobj = new Date(Date.now());
          var date = dateobj.toISOString();
          var myJson = JSON.stringify(json);
          var jsonContent = json;
          var numberAIS = Object.keys(json.features).length;
          app.debug(numberAIS + ' vessel in ' + position_radius + 'km radius from vessel');

          for (i = 0; i < numberAIS; i++) {
            var mmsi = jsonContent.features[i].mmsi;
            var latitude = jsonContent.features[i].geometry.coordinates[1];
            var longitude = jsonContent.features[i].geometry.coordinates[0];
            var sog = kmh_to_knots(jsonContent.features[i].properties.sog);
            var cog = degrees_to_radians(jsonContent.features[i].properties.cog);
            var navStat = stateArray[jsonContent.features[i].properties.navStat];
            var rot = degrees_to_radians(jsonContent.features[i].properties.rot);
            var heading = degrees_to_radians(jsonContent.features[i].properties.heading);
            var stampExt = jsonContent.features[i].properties.timestampExternal;
            var timestamp = (new Date(stampExt)).toISOString();

            app.handleMessage('net-ais-plugin', {
              context: 'vessels.urn:mrn:imo:mmsi:' + mmsi,
              updates: [
                {
                  values: [
                    {
                      path: '',
                      value: { mmsi }
                    },
                    {
                      path: 'navigation.position',
                      value: { longitude, latitude }
                    },
                    {
                      path: 'navigation.courseOverGroundTrue',
                      value: cog
                    },
                    {
                      path: 'navigation.courseOverGroundMagnetic',
                      value: cog
                    },
                    {
                      path: 'navigation.speedOverGround',
                      value: sog
                    },
                    {
                      path: 'navigation.rateOfTurn',
                      value: rot
                    },
                    {
                      path: 'navigation.headingTrue',
                      value: heading
                    },
                    {
                      path: 'navigation.datetime',
                      value: timestamp
                    },
                    {
                      path: 'navigation.state',
                      value: navStat
                    }
                  ],
                  source: { label: plugin.id },
                  timestamp: (new Date().toISOString()),
                }
              ]
            })

            setStatus(`Number of AIS targets: ${numberAIS} (data: ${lengthInUtf8Bytes(myJson, numberAIS)}kB, ${date})`);
            app.debug('AIS info from: ' + i);
            app.debug('mmsi: ' + mmsi);
            app.debug('lat: ' + lat);
            app.debug('lon: ' + lon);
            app.debug('sog: ' + sog);
            app.debug('cog: ' + cog);
            app.debug('navStat: ' + navStat);
            app.debug('rot: ' + rot);
            app.debug('heading: ' + heading);
            var stampExt = jsonContent.features[i].properties.timestampExternal;
            var stampExt = new Date(stampExt).toISOString();
            app.debug('timestamp: ' + stampExt);

            var url = "https://meri.digitraffic.fi/api/ais/v1/vessels/" + jsonContent.features[i].mmsi;
            fetchNew(url, { method: 'GET' })
              .then((res) => {
                return res.json()
              })
              .then((json) => {
                var jsonContentMeta = json;
                var timestampMeta = jsonContentMeta.timestamp;
                var destination = jsonContentMeta.destination;
                var mmsiMeta = jsonContentMeta.mmsi;
                var callSign = jsonContentMeta.callSign;
                var imo = jsonContentMeta.imo;
                var id = jsonContentMeta.shipType;
                var shipTypeName = vesselArray[id];
                var draught = draught_value(jsonContentMeta.draught);
                var eta = (jsonContentMeta.eta);
                if (eta == 0) {
                  var eta_time = (new Date(0)).toISOString();
                } else {
                  var eta_time = (new Date(timestampMeta + eta * 1000)).toISOString();
                }
                var posType = locationArray[jsonContentMeta.posType] || 'N/A';
                var name = jsonContentMeta.name;
                var A = jsonContentMeta.referencePointA;
                var B = jsonContentMeta.referencePointB;
                var C = jsonContentMeta.referencePointC;
                var D = jsonContentMeta.referencePointD;
                var lenght = (A + B);
                var beam = (C + D);
                app.debug('mmsiMeta: ' + mmsiMeta);
                app.debug('destination: ' + destination);
                app.debug('callSign: ' + callSign);
                app.debug('imo: ' + imo);
                app.debug('shipTypeId: ' + id);
                app.debug('shipType: ' + shipTypeName);
                app.debug('draught: ' + draught);
                app.debug('eta: ' + eta);
                app.debug('eta_time: ' + eta_time);
                app.debug('posType: ' + posType);
                app.debug('name: ' + name);
                app.debug('A: ' + A);
                app.debug('B: ' + B);
                app.debug('C: ' + C);
                app.debug('lenght: ' + lenght);
                app.debug('beam: ' + beam);

                app.handleMessage('net-ais-plugin', {
                  context: 'vessels.urn:mrn:imo:mmsi:' + mmsiMeta,
                  updates: [
                    {
                      values: [
                        {
                          path: '',
                          value: { name }
                        },
                        {
                          path: 'navigation.destination.commonName',
                          value: destination
                        },
                        {
                          path: 'design.aisShipType',
                          value: { id, "name": shipTypeName }
                        },
                        {
                          path: '',
                          value: { registrations: { imo: `IMO ${imo}` } }
                        },
                        {
                          path: '',
                          value: { communication: { callsignVhf: callSign } }
                        },
                        {
                          path: 'navigation.destination.eta',
                          value: eta_time
                        },
                        {
                          path: 'design.draft',
                          value: { "current": draught, "maximum": draught }
                        },
                        {
                          path: 'design.length',
                          value: { "overall": lenght }
                        },
                        {
                          path: 'design.beam',
                          value: beam
                        },
                        {
                          path: 'sensors.position.sensorType',
                          value: posType
                        },
                        {
                          path: 'sensors.ais.class',
                          value: "A"
                        }
                      ]
                    }
                  ]
                })

              })
              .catch(error => {
                if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
                  console.error(`Error: Could not resolve the address for ${url}. Please check the hostname and try again.`);
                } else {
                  console.error('An unexpected error occurred:', error.message || error);
                }
              })
          }
        })
        .catch(error => {
          if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
            console.error(`Error: Could not resolve the address for ${url}. Please check the hostname and try again.`);
          } else {
            console.error('An unexpected error occurred:', error.message || error);
          }
        })
    }
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
      atons_data: {
        type: 'boolean',
        default: true,
        title: 'Fetch Meteo data (Sea State Estimation) from AtoN sites',
      },
    },
  };

  return plugin;
};
