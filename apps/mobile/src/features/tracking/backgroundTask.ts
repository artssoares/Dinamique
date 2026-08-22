/**
 * Web has no background task to register.
 *
 * The root layout imports this module for its side effect; on device Metro
 * substitutes `backgroundTask.native.ts`. Keeping an empty module here rather
 * than guarding the import at the call site is what keeps expo-task-manager out
 * of the web dependency graph entirely, instead of merely unexecuted.
 */
export {};
