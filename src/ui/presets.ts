import type { SceneJSON } from '../sim/scene';

// Bundle preset JSONs at build time. Vite emits them inline in the JS bundle,
// so no runtime fetch and no static-asset deployment concerns.
const presetMap = import.meta.glob<SceneJSON>(
  '../../presets/*.json',
  { eager: true, import: 'default' },
);

// Display manifest. Order here is the order shown in the dropdown.
// `key` matches the JSON filename stem (without .json extension).
const MANIFEST: Array<{ key: string; label: string; group: string }> = [
  { key: '01-monopole',                  label: '単極子',                    group: '静電場の基礎' },
  { key: '02-dipole-static',             label: '双極子(静止)',              group: '静電場の基礎' },
  { key: '03-parallel-plate-capacitor',  label: '平行平板コンデンサ',        group: '静電場の基礎' },
  { key: '04-faraday-cage',              label: 'ファラデーケージ',          group: '導体・誘電体' },
  { key: '05-induction-floating',        label: '静電誘導(浮遊導体)',        group: '導体・誘電体' },
  { key: '06-dielectric-refraction',     label: '誘電体の屈折',              group: '導体・誘電体' },
  { key: '07-wave-slowing',              label: '誘電体で波が遅くなる',      group: '電磁波' },
  { key: '08-oscillating-dipole',        label: '振動双極子放射',            group: '電磁波' },
  { key: '09-two-source-interference',   label: '2電荷の干渉',               group: '電磁波' },
  { key: '10-double-slit',               label: '二重スリット回折',          group: '電磁波' },
  { key: '11-parallel-plate-waveguide',  label: '平行平板導波管',            group: '導波管・共振器' },
  { key: '12-cavity-resonator',          label: '矩形空洞共振器',            group: '導波管・共振器' },
  { key: '13-bend-waveguide',            label: '90°ベンド導波管',           group: '導波管・共振器' },
];

function findScene(key: string): SceneJSON | null {
  for (const [path, scene] of Object.entries(presetMap)) {
    if (path.endsWith(`/${key}.json`)) return scene as SceneJSON;
  }
  return null;
}

export function setupPresets(onLoad: (scene: SceneJSON) => void): void {
  const select = document.getElementById('presetSelect') as HTMLSelectElement;

  // Placeholder so the select shows a hint and so we can re-trigger on the
  // same preset (after a load we reset value to ''; the next pick fires
  // 'change' even if it's the same preset as last time).
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'プリセットを選択...';
  select.appendChild(placeholder);

  // Group by category, preserving manifest order within each group.
  const groups = new Map<string, Array<{ key: string; label: string }>>();
  for (const m of MANIFEST) {
    if (!findScene(m.key)) continue; // skip if file missing
    let list = groups.get(m.group);
    if (!list) { list = []; groups.set(m.group, list); }
    list.push({ key: m.key, label: m.label });
  }

  for (const [groupName, items] of groups) {
    const og = document.createElement('optgroup');
    og.label = groupName;
    for (const item of items) {
      const opt = document.createElement('option');
      opt.value = item.key;
      opt.textContent = item.label;
      og.appendChild(opt);
    }
    select.appendChild(og);
  }

  select.addEventListener('change', () => {
    const key = select.value;
    if (!key) return;
    const scene = findScene(key);
    if (!scene) return;
    onLoad(scene);
    // Reset to placeholder so re-selecting the same preset fires 'change'.
    select.value = '';
  });
}
