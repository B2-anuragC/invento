// GSTIN: 15 characters = 2-digit state code + 10-character PAN + entity number
// + "Z" (default) + a check character (base-36 weighted checksum).

export const GSTIN_RULE_MESSAGE = 'Enter a valid 15-character GSTIN, e.g. 27AAPFU0939F1ZV.';

/** GST state codes used as place of supply (CBIC list). */
export const GST_STATES: Readonly<Record<string, string>> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

// Codes retired by state reorganisation; older registrations may still carry them.
const RETIRED_STATE_CODES: Readonly<Record<string, string>> = { '25': '26', '28': '37' };

const CHARACTERS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function normalizeGstin(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function isGstStateCode(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(GST_STATES, value);
}

/** The check character a GSTIN's first 14 characters require. */
export function gstinCheckCharacter(first14: string): string {
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    const product = CHARACTERS.indexOf(first14[index]) * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARACTERS[(36 - (sum % 36)) % 36];
}

/** Format, state code and check character. Expects a normalised value. */
export function isValidGstin(value: string): boolean {
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value)) return false;
  const state = value.slice(0, 2);
  if (!isGstStateCode(state) && !(state in RETIRED_STATE_CODES)) return false;
  return gstinCheckCharacter(value.slice(0, 14)) === value[14];
}

/** Current state code a GSTIN is registered in, e.g. "27" for Maharashtra. */
export function gstinStateCode(gstin: string): string {
  const state = gstin.slice(0, 2);
  return RETIRED_STATE_CODES[state] ?? state;
}
