declare module 'qrcode' {
  export interface QrRenderOptions {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    type?: 'png';
    width?: number;
  }

  const qrCode: {
    toBuffer(text: string, options?: QrRenderOptions): Promise<Buffer>;
  };
  export default qrCode;
}
