export declare function bindStream(fn: any, config: any): Promise<any>
export declare function pushStream(message: string, config: any): Promise<any>
export declare function disconnect(): Promise<any>
declare module 'feathers-amqp-client' {
  export function bindStream(fn: any, config: any): Promise<any>
  export function pushStream(message: string, config: any): Promise<any>
}