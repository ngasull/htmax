interface ImportMetaEnv {
  [key: string]: any;
  DEV: boolean;
}

interface ImportMeta {
  url: string;

  readonly env: ImportMetaEnv;
}
