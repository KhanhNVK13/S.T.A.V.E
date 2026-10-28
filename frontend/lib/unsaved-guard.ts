let unsavedWork = false;

export function setUnsavedWork(value: boolean): void {
  unsavedWork = value;
}

export function hasUnsavedWork(): boolean {
  return unsavedWork;
}
