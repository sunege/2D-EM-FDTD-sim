// Snapshot-based undo/redo. After each undoable user action (object placement,
// deletion, parameter change), call `commit()` — the simulation state is
// serialized via Scene and pushed onto a bounded ring buffer. Drag movements
// and UI toggle flips are intentionally NOT undoable per spec.
//
// Model:
//   `lastCommitted` holds the *previous* committed snapshot (the "before" state
//   for the next commit). On commit, it goes onto undoStack and is replaced
//   with the current scene. undo() pops undoStack, restores it, and stashes
//   the previous lastCommitted into redoStack. redo() is the mirror.

import * as Scene from './scene';

const MAX_HISTORY = 5;

let lastCommitted: Scene.SceneJSON | null = null;
const undoStack: Scene.SceneJSON[] = [];
const redoStack: Scene.SceneJSON[] = [];

// While true, commit() is a no-op — used to suppress recursive commits while
// applying a snapshot from undo/redo.
let restoring = false;

// Set this baseline once at app boot (after the initial reset/empty scene)
// and again after every full scene replace (Reset button / scene load).
export function reset(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  lastCommitted = Scene.serialize();
}

// Record the current state as an undoable step. Discards any redo history.
export function commit(): void {
  if (restoring) return;
  if (lastCommitted !== null) {
    undoStack.push(lastCommitted);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
  }
  lastCommitted = Scene.serialize();
  redoStack.length = 0;
}

export function canUndo(): boolean { return undoStack.length > 0; }
export function canRedo(): boolean { return redoStack.length > 0; }

export function undo(resetSim: () => void): boolean {
  if (undoStack.length === 0) return false;
  const target = undoStack.pop()!;
  if (lastCommitted !== null) redoStack.push(lastCommitted);
  restoring = true;
  try {
    Scene.deserialize(target, resetSim);
  } finally {
    restoring = false;
  }
  lastCommitted = target;
  return true;
}

export function redo(resetSim: () => void): boolean {
  if (redoStack.length === 0) return false;
  const target = redoStack.pop()!;
  if (lastCommitted !== null) undoStack.push(lastCommitted);
  restoring = true;
  try {
    Scene.deserialize(target, resetSim);
  } finally {
    restoring = false;
  }
  lastCommitted = target;
  return true;
}
