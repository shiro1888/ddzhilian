declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_SIGNALING_WS_URL?: string
    readonly NEXT_PUBLIC_SIGNALING_HTTP_URL?: string
    readonly VITE_SIGNALING_WS_URL?: string
    readonly VITE_SIGNALING_HTTP_URL?: string
  }
}
