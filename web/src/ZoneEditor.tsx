import { useEffect, useState } from 'react';
import type { Zone, ZoneType } from './types';
import { getZones, saveZones } from './api';

const TYPES: ZoneType[] = ['sanctuary', 'migration', 'patrol'];

export function ZoneEditor() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { getZones().then(setZones); }, []);

  function update(i: number, patch: Partial<Zone>) {
    setZones((zs) => zs.map((z, idx) => (idx === i ? { ...z, ...patch } : z)));
  }
  function add() {
    setZones((zs) => [...zs, { id: '', name: 'New Zone', type: 'patrol', x: 0, y: 0, radius: 10000 }]);
  }
  function remove(i: number) {
    setZones((zs) => zs.filter((_, idx) => idx !== i));
  }
  async function save() {
    const res = await saveZones(zones);
    setZones(res);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="panel zone-editor">
      <div className="panel-head row">
        <h2>Zones</h2>
        <button className="link-btn" onClick={() => setOpen((o) => !o)}>{open ? 'hide' : 'edit'}</button>
      </div>
      {open && (
        <>
          <p className="muted small">
            Sanctuaries are fixed; migration/patrol rotate — update them per rotation.
            Coordinates are in world units (calibrate to the live map).
          </p>
          <div className="zone-rows">
            {zones.map((z, i) => (
              <div className="zone-row" key={z.id || i}>
                <input className="zn" value={z.name} onChange={(e) => update(i, { name: e.target.value })} />
                <select value={z.type} onChange={(e) => update(i, { type: e.target.value as ZoneType })}>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="number" value={z.x} onChange={(e) => update(i, { x: Number(e.target.value) })} />
                <input type="number" value={z.y} onChange={(e) => update(i, { y: Number(e.target.value) })} />
                <input type="number" value={z.radius} onChange={(e) => update(i, { radius: Number(e.target.value) })} />
                <button className="link-btn" onClick={() => remove(i)}>✕</button>
              </div>
            ))}
          </div>
          <div className="row gap">
            <button className="btn sm" onClick={add}>+ add zone</button>
            <button className="btn sm" onClick={save}>{saved ? 'saved ✓' : 'save zones'}</button>
          </div>
        </>
      )}
    </div>
  );
}
