// Shim: the Activity panel moved to `./activity/`. Re-exported here so existing
// import paths (SecondarySidebar, tests importing `ActivityList` from this
// module) keep working through the split.
export { ActivityPanel, ActivityList } from './activity'
