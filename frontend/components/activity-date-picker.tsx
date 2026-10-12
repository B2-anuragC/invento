import { DatePicker } from './date-picker';
export function ActivityDatePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <DatePicker value={value} onChange={onChange} title="Select activity date" placeholder="All dates" clearLabel="All dates" style={{ flex: 1 }} />;
}
