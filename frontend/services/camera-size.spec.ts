import { describe, expect, it } from 'vitest';
import { choosePictureSize } from './camera-size';
describe('Camera capture resolution', () => {
  it('selects the largest supported size within the processing limit', () => {
    expect(choosePictureSize(['4000x3000', '640x480', '1600x1200', '1280x720'])).toBe('1600x1200');
    expect(choosePictureSize(['1200x1600', '3000x4000', '480x640'])).toBe('1200x1600');
  });
  it('uses the smallest supported size when none fit and ignores unknown formats', () => {
    expect(choosePictureSize(['4000x3000', '1920x1080', '2560x1440', 'High', '0x0'])).toBe('1920x1080');
    expect(choosePictureSize(['High'])).toBeUndefined();
  });
});
