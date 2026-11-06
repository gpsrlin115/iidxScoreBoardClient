import { useEffect, useRef, useState } from 'react';
import { noteRadarApi } from './api';
import { errorMessage } from './model.js';

// Recalculates the bundle through /simulate. Results are tied to the bundle version, so any edit
// both aborts an in-flight request and makes an older result invisible.
export function useBundleSimulation(version, targets) {
  const [sim, setSim] = useState({ version: -1, busy: false, result: null, error: '' });
  const generation = useRef(0);
  const controller = useRef(null);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, [version]);
  const run = async () => {
    if (!targets) return;
    const token = ++generation.current;
    controller.current?.abort();
    controller.current = new AbortController();
    setSim({ version, busy: true, result: null, error: '' });
    try {
      const result = await noteRadarApi.simulate(targets, controller.current.signal);
      if (token === generation.current) setSim({ version, busy: false, result, error: '' });
    } catch (failure) {
      if (token === generation.current) setSim({ version, busy: false, result: null, error: errorMessage(failure) });
    }
  };
  const current = sim.version === version ? sim : { busy: false, result: null, error: '' };
  return { ...current, run };
}
