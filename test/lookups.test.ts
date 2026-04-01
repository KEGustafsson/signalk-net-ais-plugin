import { describe, it, expect } from 'vitest';
import { NAVIGATION_STATES, VESSEL_TYPES, POSITION_TYPES } from '../src/lookups';

describe('NAVIGATION_STATES', () => {
  it('has 16 entries (0-15)', () => {
    expect(Object.keys(NAVIGATION_STATES)).toHaveLength(16);
  });

  it('maps 0 to motoring', () => {
    expect(NAVIGATION_STATES[0]).toBe('motoring');
  });

  it('maps 1 to anchored', () => {
    expect(NAVIGATION_STATES[1]).toBe('anchored');
  });

  it('maps 5 to moored', () => {
    expect(NAVIGATION_STATES[5]).toBe('moored');
  });

  it('maps 7 to fishing', () => {
    expect(NAVIGATION_STATES[7]).toBe('fishing');
  });

  it('maps 8 to sailing', () => {
    expect(NAVIGATION_STATES[8]).toBe('sailing');
  });

  it('maps 15 to default', () => {
    expect(NAVIGATION_STATES[15]).toBe('default');
  });

  it('returns undefined for unknown state', () => {
    expect(NAVIGATION_STATES[99]).toBeUndefined();
  });
});

describe('VESSEL_TYPES', () => {
  it('maps 70 to Cargo ship', () => {
    expect(VESSEL_TYPES[70]).toBe('Cargo ship');
  });

  it('maps 80 to Tanker', () => {
    expect(VESSEL_TYPES[80]).toBe('Tanker');
  });

  it('maps 60 to Passenger ship', () => {
    expect(VESSEL_TYPES[60]).toBe('Passenger ship');
  });

  it('maps 52 to Tug', () => {
    expect(VESSEL_TYPES[52]).toBe('Tug');
  });

  it('maps 30 to Fishing', () => {
    expect(VESSEL_TYPES[30]).toBe('Fishing');
  });

  it('returns undefined for unmapped type', () => {
    expect(VESSEL_TYPES[0]).toBeUndefined();
  });

  it('returns undefined for type 10', () => {
    expect(VESSEL_TYPES[10]).toBeUndefined();
  });
});

describe('POSITION_TYPES', () => {
  it('maps 1 to GPS', () => {
    expect(POSITION_TYPES[1]).toBe('GPS');
  });

  it('maps 2 to GLONASS', () => {
    expect(POSITION_TYPES[2]).toBe('GLONASS');
  });

  it('maps 8 to Galileo', () => {
    expect(POSITION_TYPES[8]).toBe('Galileo');
  });

  it('maps 15 to internal GNSS', () => {
    expect(POSITION_TYPES[15]).toBe('internal GNSS');
  });

  it('returns undefined for 0', () => {
    expect(POSITION_TYPES[0]).toBeUndefined();
  });

  it('returns undefined for 16', () => {
    expect(POSITION_TYPES[16]).toBeUndefined();
  });
});
