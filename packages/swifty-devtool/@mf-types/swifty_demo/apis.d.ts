
    export type RemoteKeys = 'swifty_demo/counter-view';
    type PackageType<T> = T extends 'swifty_demo/counter-view' ? typeof import('swifty_demo/counter-view') :any;