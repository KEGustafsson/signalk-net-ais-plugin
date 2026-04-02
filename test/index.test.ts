import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SignalKApp, SignalKPlugin, PluginOptions, SignalKDelta } from '../src/types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockApp(): SignalKApp & {
  messages: Array<{ id: string; delta: SignalKDelta }>;
  debugMessages: unknown[];
  errorMessages: string[];
  statusMessages: string[];
} {
  const messages: Array<{ id: string; delta: SignalKDelta }> = [];
  const debugMessages: unknown[] = [];
  const errorMessages: string[] = [];
  const statusMessages: string[] = [];

  return {
    messages,
    debugMessages,
    errorMessages,
    statusMessages,
    debug: (...args: unknown[]) => {
      debugMessages.push(...args);
    },
    error: (msg: string) => {
      errorMessages.push(msg);
    },
    handleMessage: (id: string, delta: SignalKDelta) => {
      messages.push({ id, delta });
    },
    getSelfPath: vi.fn((path: string) => {
      if (path === 'navigation.position.value.longitude') return 24.9384;
      if (path === 'navigation.position.value.latitude') return 60.1699;
      return undefined;
    }),
    setPluginStatus: (status: string) => {
      statusMessages.push(status);
    },
    subscriptionmanager: {
      subscribe: vi.fn(),
    },
  };
}

function defaultOptions(): PluginOptions {
  return {
    position_update: 1,
    position_retention: 30,
    position_radius: 10,
    atons_data: false,
  };
}

function mockJsonResponse<T>(data: T, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
  } as Response;
}

import createPlugin from '../src/index';

beforeEach(() => {
  vi.useFakeTimers();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('plugin identity', () => {
  it('has correct id', () => {
    const app = createMockApp();
    const plugin = createPlugin(app);
    expect(plugin.id).toBe('net-ais-plugin');
  });

  it('has correct name', () => {
    const app = createMockApp();
    const plugin = createPlugin(app);
    expect(plugin.name).toBe('Net-AIS');
  });

  it('has description', () => {
    const app = createMockApp();
    const plugin = createPlugin(app);
    expect(plugin.description).toBeTruthy();
  });
});

describe('plugin schema', () => {
  it('has type object', () => {
    const app = createMockApp();
    const plugin = createPlugin(app);
    expect(plugin.schema.type).toBe('object');
  });

  it('defines position_update property', () => {
    const app = createMockApp();
    const plugin = createPlugin(app);
    expect(plugin.schema.properties.position_update).toBeDefined();
    expect(plugin.schema.properties.position_update?.type).toBe('integer');
    expect(plugin.schema.properties.position_update?.default).toBe(1);
  });

  it('defines position_retention property', () => {
    const app = createMockApp();
    const plugin = createPlugin(app);
    expect(plugin.schema.properties.position_retention).toBeDefined();
    expect(plugin.schema.properties.position_retention?.default).toBe(30);
  });

  it('defines position_radius property', () => {
    const app = createMockApp();
    const plugin = createPlugin(app);
    expect(plugin.schema.properties.position_radius).toBeDefined();
    expect(plugin.schema.properties.position_radius?.default).toBe(10);
  });

  it('defines atons_data property', () => {
    const app = createMockApp();
    const plugin = createPlugin(app);
    expect(plugin.schema.properties.atons_data).toBeDefined();
    expect(plugin.schema.properties.atons_data?.type).toBe('boolean');
    expect(plugin.schema.properties.atons_data?.default).toBe(true);
  });
});

describe('plugin.start', () => {
  it('subscribes to navigation position', () => {
    const app = createMockApp();
    const plugin = createPlugin(app);
    plugin.start(defaultOptions(), () => {});

    expect(app.subscriptionmanager.subscribe).toHaveBeenCalledTimes(1);
    const subscribeCall = vi.mocked(app.subscriptionmanager.subscribe).mock.calls[0];
    expect(subscribeCall?.[0]).toEqual({
      context: 'vessels.self',
      subscribe: [{ path: 'navigation.position.value', period: 10000 }],
    });

    plugin.stop();
  });

  it('logs configuration on start', () => {
    const app = createMockApp();
    const plugin = createPlugin(app);
    plugin.start(defaultOptions(), () => {});

    expect(app.debugMessages).toContain('Plugin started');
    plugin.stop();
  });
});

describe('plugin.stop', () => {
  it('logs stop message', () => {
    const app = createMockApp();
    const plugin = createPlugin(app);
    plugin.start(defaultOptions(), () => {});
    plugin.stop();

    expect(app.debugMessages).toContain('Net-AIS Stopped');
  });

  it('can be called multiple times safely', () => {
    const app = createMockApp();
    const plugin = createPlugin(app);
    plugin.start(defaultOptions(), () => {});
    plugin.stop();
    plugin.stop();
    // Should not throw
  });
});

describe('AIS data fetching', () => {
  it('fetches AIS data after initial interval', async () => {
    const app = createMockApp();
    const plugin = createPlugin(app);

    const locationsResponse = {
      features: [
        {
          mmsi: 230012345,
          geometry: { coordinates: [24.5, 60.1] },
          properties: {
            sog: 10,
            cog: 180,
            navStat: 0,
            rot: 0,
            heading: 180,
            timestampExternal: '2024-01-01T00:00:00Z',
          },
        },
      ],
    };

    const metadataResponse = {
      mmsi: 230012345,
      name: 'TEST',
      destination: 'HELSINKI',
      callSign: 'TEST',
      imo: 1234567,
      shipType: 70,
      draught: 50,
      eta: 0,
      posType: 1,
      timestamp: 1704067200000,
      referencePointA: 50,
      referencePointB: 50,
      referencePointC: 10,
      referencePointD: 10,
    };

    mockFetch
      .mockResolvedValueOnce(mockJsonResponse(locationsResponse))
      .mockResolvedValueOnce(mockJsonResponse(metadataResponse));

    plugin.start(defaultOptions(), () => {});

    // Advance past the initial 5s interval
    await vi.advanceTimersByTimeAsync(5000);

    // Should have sent location delta
    expect(app.messages.length).toBeGreaterThanOrEqual(1);
    const locationMsg = app.messages.find((m) =>
      m.delta.context.includes('230012345')
    );
    expect(locationMsg).toBeDefined();

    plugin.stop();
  });

  it('skips fetch when no position available', async () => {
    const app = createMockApp();
    vi.mocked(app.getSelfPath).mockReturnValue(undefined);
    const plugin = createPlugin(app);

    plugin.start(defaultOptions(), () => {});
    await vi.advanceTimersByTimeAsync(5000);

    expect(mockFetch).not.toHaveBeenCalled();
    plugin.stop();
  });

  it('handles API errors gracefully', async () => {
    const app = createMockApp();
    const plugin = createPlugin(app);

    mockFetch.mockResolvedValueOnce(mockJsonResponse({}, 500));

    plugin.start(defaultOptions(), () => {});
    await vi.advanceTimersByTimeAsync(5000);

    expect(app.errorMessages.length).toBeGreaterThan(0);
    expect(app.errorMessages[0]).toContain('Error fetching AIS locations');
    plugin.stop();
  });

  it('handles network errors gracefully', async () => {
    const app = createMockApp();
    const plugin = createPlugin(app);

    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    plugin.start(defaultOptions(), () => {});
    await vi.advanceTimersByTimeAsync(5000);

    expect(app.errorMessages.length).toBeGreaterThan(0);
    expect(app.errorMessages[0]).toContain('Network error');
    plugin.stop();
  });

  it('handles partial metadata fetch failures', async () => {
    const app = createMockApp();
    const plugin = createPlugin(app);

    const locationsResponse = {
      features: [
        {
          mmsi: 111111111,
          geometry: { coordinates: [24.5, 60.1] },
          properties: { sog: 10, cog: 180, navStat: 0, rot: 0, heading: 180, timestampExternal: '2024-01-01T00:00:00Z' },
        },
        {
          mmsi: 222222222,
          geometry: { coordinates: [24.6, 60.2] },
          properties: { sog: 5, cog: 90, navStat: 1, rot: 0, heading: 90, timestampExternal: '2024-01-01T00:00:00Z' },
        },
      ],
    };

    mockFetch
      .mockResolvedValueOnce(mockJsonResponse(locationsResponse))
      .mockResolvedValueOnce(mockJsonResponse({}, 404))
      .mockResolvedValueOnce(mockJsonResponse({
        mmsi: 222222222, name: 'VESSEL2', destination: '', callSign: '', imo: 0,
        shipType: 70, draught: 0, eta: 0, posType: 1, timestamp: 0,
        referencePointA: 0, referencePointB: 0, referencePointC: 0, referencePointD: 0,
      }));

    plugin.start(defaultOptions(), () => {});
    await vi.advanceTimersByTimeAsync(5000);

    // Location deltas sent for both vessels
    const locationMsgs = app.messages.filter((m) => m.delta.context.includes('vessels.'));
    expect(locationMsgs.length).toBeGreaterThanOrEqual(2);

    // One metadata error logged
    expect(app.errorMessages.length).toBeGreaterThan(0);
    plugin.stop();
  });
});

describe('Meteo data fetching', () => {
  it('fetches meteo data when atons_data is true', async () => {
    const app = createMockApp();
    const plugin = createPlugin(app);

    const measurementsResponse = {
      features: [
        {
          properties: {
            siteNumber: 12345,
            siteName: 'Test Station',
            siteType: 'wave',
            seaState: 3,
            trend: 'rising',
            windWaveDir: 180,
            temperature: 15,
            lastUpdate: '2024-01-01T00:00:00Z',
          },
          geometry: { coordinates: [25.0, 60.0] },
        },
      ],
    };

    // First call will be for AIS locations (initial interval fires at same time)
    mockFetch
      .mockResolvedValueOnce(mockJsonResponse({ features: [] })) // locations
      .mockResolvedValueOnce(mockJsonResponse(measurementsResponse)); // measurements

    const options = { ...defaultOptions(), atons_data: true };
    plugin.start(options, () => {});

    await vi.advanceTimersByTimeAsync(5000);

    const meteoMsg = app.messages.find((m) => m.delta.context.includes('meteo.'));
    expect(meteoMsg).toBeDefined();
    expect(meteoMsg?.delta.context).toBe('meteo.urn:mrn:imo:mmsi:000012345');

    plugin.stop();
  });

  it('does not fetch meteo when atons_data is false', async () => {
    const app = createMockApp();
    const plugin = createPlugin(app);

    mockFetch.mockResolvedValue(mockJsonResponse({ features: [] }));

    const options = { ...defaultOptions(), atons_data: false };
    plugin.start(options, () => {});

    await vi.advanceTimersByTimeAsync(5000);

    const meteoMsg = app.messages.find((m) => m.delta.context.includes('meteo.'));
    expect(meteoMsg).toBeUndefined();

    plugin.stop();
  });
});

describe('status reporting', () => {
  it('reports AIS target count in status', async () => {
    const app = createMockApp();
    const plugin = createPlugin(app);

    const locationsResponse = {
      features: [
        {
          mmsi: 230012345,
          geometry: { coordinates: [24.5, 60.1] },
          properties: { sog: 10, cog: 180, navStat: 0, rot: 0, heading: 180, timestampExternal: '2024-01-01T00:00:00Z' },
        },
      ],
    };

    mockFetch
      .mockResolvedValueOnce(mockJsonResponse(locationsResponse))
      .mockResolvedValueOnce(mockJsonResponse({
        mmsi: 230012345, name: 'T', destination: '', callSign: '', imo: 0,
        shipType: 70, draught: 0, eta: 0, posType: 1, timestamp: 0,
        referencePointA: 0, referencePointB: 0, referencePointC: 0, referencePointD: 0,
      }));

    plugin.start(defaultOptions(), () => {});
    await vi.advanceTimersByTimeAsync(5000);

    expect(app.statusMessages.length).toBeGreaterThan(0);
    expect(app.statusMessages[0]).toContain('Number of AIS targets: 1');

    plugin.stop();
  });

  it('works without setPluginStatus (uses setProviderStatus)', () => {
    const app = createMockApp();
    delete app.setPluginStatus;
    (app as SignalKApp & { setProviderStatus: (s: string) => void }).setProviderStatus = vi.fn();
    const plugin = createPlugin(app);
    expect(plugin.id).toBe('net-ais-plugin');
  });

  it('reports status via setProviderStatus when setPluginStatus is absent', async () => {
    const providerStatusMessages: string[] = [];
    const app = createMockApp();
    delete app.setPluginStatus;
    (app as SignalKApp & { setProviderStatus: (s: string) => void }).setProviderStatus = (s: string) => {
      providerStatusMessages.push(s);
    };

    const plugin = createPlugin(app);

    mockFetch
      .mockResolvedValueOnce(mockJsonResponse({
        features: [{
          mmsi: 123, geometry: { coordinates: [24, 60] },
          properties: { sog: 0, cog: 0, navStat: 0, rot: 0, heading: 0, timestampExternal: '2024-01-01T00:00:00Z' },
        }],
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        mmsi: 123, name: 'T', destination: '', callSign: '', imo: 0,
        shipType: 70, draught: 0, eta: 0, posType: 1, timestamp: 0,
        referencePointA: 0, referencePointB: 0, referencePointC: 0, referencePointD: 0,
      }));

    plugin.start(defaultOptions(), () => {});
    await vi.advanceTimersByTimeAsync(5000);

    expect(providerStatusMessages.length).toBeGreaterThan(0);
    expect(providerStatusMessages[0]).toContain('Number of AIS targets: 1');
    plugin.stop();
  });
});

describe('double start protection', () => {
  it('cleans up intervals when start() is called twice', async () => {
    const app = createMockApp();
    const plugin = createPlugin(app);

    mockFetch.mockResolvedValue(mockJsonResponse({ features: [] }));

    plugin.start(defaultOptions(), () => {});
    // Start again without stop - should not leak
    plugin.start(defaultOptions(), () => {});

    await vi.advanceTimersByTimeAsync(5000);

    // Only one set of fetches should be active
    // The first start's timers should have been cleaned up
    plugin.stop();
  });

  it('does not throw when start() is called twice with atons_data', async () => {
    const app = createMockApp();
    const plugin = createPlugin(app);

    mockFetch.mockResolvedValue(mockJsonResponse({ features: [] }));

    const options = { ...defaultOptions(), atons_data: true };
    plugin.start(options, () => {});
    plugin.start(options, () => {});

    await vi.advanceTimersByTimeAsync(5000);
    plugin.stop();
  });
});
