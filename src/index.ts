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

import type { PluginOptions, SignalKApp, SignalKPlugin } from './types';
import {
  fetchLocations,
  fetchMeasurements,
  fetchVesselMetadata,
  formatMeasurementDate,
  getErrorMessage,
  isNetworkError,
} from './api';
import { buildLocationDelta, buildMetadataDelta, buildMeteoDelta } from './delta';
import { estimateDataSizeKb } from './converters';

function createPlugin(app: SignalKApp): SignalKPlugin {
  let positionUpdate = 1;
  let positionRetention = 30;
  let positionRadius = 10;

  let timeoutInitialAis: ReturnType<typeof setTimeout> | undefined;
  let intervalAis: ReturnType<typeof setInterval> | undefined;
  let timeoutInitialMeteo: ReturnType<typeof setTimeout> | undefined;
  let intervalMeteo: ReturnType<typeof setInterval> | undefined;
  let unsubscribes: Array<() => void> = [];

  const setStatus = app.setPluginStatus ?? app.setProviderStatus;

  async function readInfo(): Promise<void> {
    const lon = app.getSelfPath('navigation.position.value.longitude');
    const lat = app.getSelfPath('navigation.position.value.latitude');

    if (lon === undefined || lat === undefined) {
      app.debug('No vessel position available, skipping AIS fetch');
      return;
    }

    try {
      const from = Math.floor(Date.now()) - 60000 * positionRetention;
      const json = await fetchLocations({
        from,
        radius: positionRadius,
        latitude: lat,
        longitude: lon,
      });

      const numberAIS = json.features.length;
      const dateStr = new Date().toISOString();
      const jsonStr = JSON.stringify(json);

      app.debug(`${numberAIS} vessels in ${positionRadius}km radius`);

      for (const feature of json.features) {
        const locationDelta = buildLocationDelta(feature, plugin.id);
        app.handleMessage(plugin.id, locationDelta);
      }

      if (setStatus) {
        setStatus(
          `Number of AIS targets: ${numberAIS} (data: ${estimateDataSizeKb(jsonStr, numberAIS)}kB, ${dateStr})`
        );
      }

      const metadataResults = await Promise.allSettled(
        json.features.map((feature) => fetchVesselMetadata(feature.mmsi))
      );

      for (const result of metadataResults) {
        if (result.status === 'fulfilled') {
          const metaDelta = buildMetadataDelta(result.value, plugin.id);
          app.handleMessage(plugin.id, metaDelta);
        } else {
          const reason: unknown = result.reason;
          if (isNetworkError(reason)) {
            app.error(`Network error fetching vessel metadata: ${getErrorMessage(reason)}`);
          } else {
            app.error(`Error fetching vessel metadata: ${getErrorMessage(reason)}`);
          }
        }
      }
    } catch (error: unknown) {
      if (isNetworkError(error)) {
        app.error(`Network error fetching AIS locations: ${getErrorMessage(error)}`);
      } else {
        app.error(`Error fetching AIS locations: ${getErrorMessage(error)}`);
      }
    }
  }

  async function readMeteo(): Promise<void> {
    try {
      const fromDate = formatMeasurementDate();
      const json = await fetchMeasurements(fromDate);

      for (const feature of json.features) {
        const delta = buildMeteoDelta(feature, plugin.id);
        app.handleMessage(plugin.id, delta);

        app.debug(`Meteo: ${feature.properties.siteName} (${feature.properties.siteNumber})`);
      }
    } catch (error: unknown) {
      if (isNetworkError(error)) {
        app.error(`Network error fetching meteo data: ${getErrorMessage(error)}`);
      } else {
        app.error(`Error fetching meteo data: ${getErrorMessage(error)}`);
      }
    }
  }

  const plugin: SignalKPlugin = {
    id: 'net-ais-plugin',
    name: 'Net-AIS',
    description:
      "Marine traffic information is gathered from Finnish Transport Agency's data sources",

    start(options: PluginOptions) {
      // Guard against double-start: clean up any existing timers
      plugin.stop();

      positionUpdate = options.position_update;
      positionRetention = options.position_retention;
      positionRadius = options.position_radius;

      app.debug(`position_update: ${positionUpdate}`);
      app.debug(`position_retention: ${positionRetention}`);
      app.debug(`position_radius: ${positionRadius}`);
      app.debug('Plugin started');

      app.subscriptionmanager.subscribe(
        {
          context: 'vessels.self',
          subscribe: [{ path: 'navigation.position.value', period: 10000 }],
        },
        unsubscribes,
        (subscriptionError) => {
          app.error(`Error: ${subscriptionError}`);
        },
        (delta) => {
          delta.updates.forEach((u) => {
            app.debug(u);
          });
        }
      );

      // Initial fetch after short delay, then at configured interval
      timeoutInitialAis = setTimeout(() => void readInfo(), 5000);
      intervalAis = setInterval(() => void readInfo(), positionUpdate * 60000);

      if (options.atons_data) {
        timeoutInitialMeteo = setTimeout(() => void readMeteo(), 5000);
        intervalMeteo = setInterval(() => void readMeteo(), positionUpdate * 60000);
      }
    },

    stop() {
      if (timeoutInitialAis !== undefined) {
        clearTimeout(timeoutInitialAis);
        timeoutInitialAis = undefined;
      }
      if (intervalAis !== undefined) {
        clearInterval(intervalAis);
        intervalAis = undefined;
      }
      if (timeoutInitialMeteo !== undefined) {
        clearTimeout(timeoutInitialMeteo);
        timeoutInitialMeteo = undefined;
      }
      if (intervalMeteo !== undefined) {
        clearInterval(intervalMeteo);
        intervalMeteo = undefined;
      }
      unsubscribes.forEach((f) => f());
      unsubscribes = [];
      app.debug('Net-AIS Stopped');
    },

    schema: {
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
          title: 'AIS targets around the vessel (radius in km)',
        },
        atons_data: {
          type: 'boolean',
          default: true,
          title: 'Fetch Meteo data (Sea State Estimation) from AtoN sites',
        },
      },
    },
  };

  return plugin;
}

export = createPlugin;
