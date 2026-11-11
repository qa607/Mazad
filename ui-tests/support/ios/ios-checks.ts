/** Re-exports of the iOS safety checks for the offline selfchecks (no device, no network). */
export {
  APPROVED_IOS_BUILDS,
  APPROVED_IOS_DEVICES,
  installedBuildProblem,
  QA_IPHONE,
  readIosConfig,
} from '@mobile/ios/ios.config';
export {
  IOS_DEVICE_RUNS_APPROVED,
  IOS_GATES,
  type IosGates,
  IOS_NETWORK_GUARD_READY,
  iosStaticProblem,
} from '@mobile/ios/ios-preflight';
