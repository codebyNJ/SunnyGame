// Undo/redo command stack. Commands are { label, do(), undo() } pairs; `do` is run
// once at push-time by the caller (or via run()), undo/redo replay the closures.
// Depth-capped (PRD: last 50). Notifies a listener on every change.
export class History {
  constructor(limit = 50) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(this); }

  // push an already-applied command (its do() has run); clears redo
  push(cmd) {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this._emit();
  }
  // run a command's do() then record it
  run(cmd) { cmd.do(); this.push(cmd); }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  undo() {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
    this._emit();
  }
  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.do();
    this.undoStack.push(cmd);
    this._emit();
  }
  clear() { this.undoStack.length = 0; this.redoStack.length = 0; this._emit(); }
}
