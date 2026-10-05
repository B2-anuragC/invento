import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton, AppScreen } from '@/components/invento-ui';

type DimensionUnit = 'in' | 'cm' | 'mm';
const unitOptions: DimensionUnit[] = ['in', 'cm', 'mm'];

export default function GlassCalculatorScreen() {
  const router = useRouter();
  const { productId } = useLocalSearchParams<{ productId?: string }>();
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [unit, setUnit] = useState<DimensionUnit>('in');
  const [pricePerSquareFoot, setPricePerSquareFoot] = useState('');

  const squareFeet = useMemo(() => {
    const widthValue = Number(width);
    const heightValue = Number(height);
    if (!Number.isFinite(widthValue) || !Number.isFinite(heightValue) || widthValue <= 0 || heightValue <= 0) return 0;
    const inchesPerUnit = unit === 'in' ? 1 : unit === 'cm' ? 1 / 2.54 : 1 / 25.4;
    return (widthValue * inchesPerUnit * heightValue * inchesPerUnit) / 144;
  }, [height, unit, width]);
  const total = squareFeet * Number(pricePerSquareFoot || 0);

  const useMeasurement = () => {
    if (!productId || squareFeet <= 0) return;
    router.replace(`/sale/create?productId=${encodeURIComponent(productId)}&quantity=${squareFeet.toFixed(3)}`);
  };

  return (
    <AppScreen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
          <View>
            <Text style={styles.title}>Glass calculator</Text>
            <Text style={styles.headerSubtitle}>QUICK MEASURE</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>Enter the glass dimensions to calculate the sale quantity in square feet.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Dimension unit</Text>
          <View style={styles.unitOptions}>
            {unitOptions.map((value) => (
              <Pressable key={value} onPress={() => setUnit(value)} style={[styles.unitOption, unit === value && styles.unitSelected]}>
                <Text style={[styles.unitText, unit === value && styles.unitTextSelected]}>{value}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.dimensions}>
            <View style={styles.dimensionField}>
              <Text style={styles.label}>Width</Text>
              <TextInput value={width} onChangeText={setWidth} style={styles.input} placeholder="0" placeholderTextColor="#89918C" keyboardType="decimal-pad" />
            </View>
            <Text style={styles.multiply}>×</Text>
            <View style={styles.dimensionField}>
              <Text style={styles.label}>Height</Text>
              <TextInput value={height} onChangeText={setHeight} style={styles.input} placeholder="0" placeholderTextColor="#89918C" keyboardType="decimal-pad" />
            </View>
          </View>

          <View style={styles.result}>
            <Text style={styles.resultLabel}>Calculated quantity</Text>
            <Text style={styles.resultValue}>{squareFeet.toLocaleString('en-IN', { maximumFractionDigits: 3 })} sq ft</Text>
            <Text style={styles.formula}>Converted area in square inches ÷ 144</Text>
          </View>

          <Text style={styles.label}>Selling price per sq ft · optional</Text>
          <TextInput value={pricePerSquareFoot} onChangeText={setPricePerSquareFoot} style={styles.input} placeholder="₹ 0.00" placeholderTextColor="#89918C" keyboardType="decimal-pad" />
          <View style={styles.estimate}>
            <Text style={styles.estimateLabel}>Estimated line total</Text>
            <Text style={styles.estimateValue}>{formatMoney(total)}</Text>
          </View>
          {productId ? (
            <ActionButton title="Use quantity in sale" onPress={useMeasurement} />
          ) : (
            <Text style={styles.hint}>Open this calculator from a square-foot product in a sale to use the result directly.</Text>
          )}
        </View>
      </ScrollView>
    </AppScreen>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 36, width: '100%', maxWidth: 600, alignSelf: 'center', backgroundColor: '#F5F5F5' },
  header: { minHeight: 90, marginHorizontal: -20, paddingHorizontal: 20, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  back: { alignSelf: 'center', paddingVertical: 8, paddingRight: 13 },
  backText: { color: '#24332A', fontSize: 29, fontWeight: '500' },
  title: { color: '#1D2B25', fontSize: 25, fontWeight: '800' },
  headerSubtitle: { color: '#737B77', fontSize: 11, marginTop: 4 },
  subtitle: { color: '#68746E', fontSize: 13, lineHeight: 19, marginTop: 3, marginBottom: 14 },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 17, padding: 16 },
  label: { color: '#56645C', fontSize: 11, fontWeight: '700', marginBottom: 7 },
  unitOptions: { flexDirection: 'row', gap: 8, marginBottom: 17 },
  unitOption: { minWidth: 55, alignItems: 'center', backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 10, paddingVertical: 9 },
  unitSelected: { backgroundColor: '#E7F2ED', borderColor: '#95B9A4' },
  unitText: { color: '#657269', fontSize: 12, fontWeight: '700' },
  unitTextSelected: { color: '#176B50' },
  dimensions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dimensionField: { flex: 1 },
  multiply: { color: '#78837C', fontSize: 20, marginTop: 17 },
  input: { minHeight: 46, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 12, paddingHorizontal: 12, color: '#17241E', fontSize: 14 },
  result: { backgroundColor: '#E7F2ED', borderRadius: 15, padding: 15, marginVertical: 17 },
  resultLabel: { color: '#65766B', fontSize: 11, fontWeight: '700' },
  resultValue: { color: '#176B50', fontSize: 28, fontWeight: '800', marginTop: 6 },
  formula: { color: '#6A796F', fontSize: 10, marginTop: 5 },
  estimate: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E8EDE8', paddingTop: 14, marginTop: 12, marginBottom: 15 },
  estimateLabel: { color: '#6A766F', fontSize: 12 },
  estimateValue: { color: '#176B50', fontSize: 16, fontWeight: '800' },
  hint: { color: '#78837C', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 9 },
});
