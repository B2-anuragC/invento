import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ProductRecord } from '@/services/api';
export function SupplierCatalogFields({ products, categories, productIds, onChange }: { products: ProductRecord[]; categories: string[]; productIds: string[]; onChange: (categories: string[], productIds: string[]) => void }) {
  const [search, setSearch] = useState('');
  const choices = [...new Set(products.map((product) => product.category).filter((value): value is string => Boolean(value)))].sort();
  const toggle = (values: string[], value: string) => values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
  const matches = products.filter((product) => productIds.includes(product.id) || (search.trim() && `${product.name} ${product.sku}`.toLowerCase().includes(search.trim().toLowerCase())));
  return <View style={styles.card}>
    <Text style={styles.title}>Products this supplier sells</Text><Text style={styles.hint}>Select categories, specific products, or both. Leave empty to allow all products.</Text>
    <Text style={styles.label}>Categories</Text><View style={styles.row}>{[...new Set([...choices, ...categories])].map((category) => <Pressable key={category} accessibilityRole="button" accessibilityState={{ selected: categories.includes(category) }} onPress={() => onChange(toggle(categories, category), productIds)} style={[styles.chip, categories.includes(category) && styles.selected]}><Text style={styles.text}>{categories.includes(category) ? '✓ ' : ''}{category}</Text></Pressable>)}</View>
    {!choices.length ? <Text style={styles.hint}>Add categories to your products to select them here.</Text> : null}
    <Text style={styles.label}>Specific products · {productIds.length} selected</Text><TextInput accessibilityLabel="Search supplier products" value={search} onChangeText={setSearch} placeholder="Search product name or SKU" style={styles.input} />
    {matches.map((product) => <Pressable key={product.id} accessibilityRole="button" accessibilityState={{ selected: productIds.includes(product.id) }} onPress={() => onChange(categories, toggle(productIds, product.id))} style={styles.product}><Text style={styles.text}>{productIds.includes(product.id) ? '☑' : '☐'} {product.name} · {product.sku}</Text></Pressable>)}
    {search.trim() && !matches.length ? <Text style={styles.hint}>No matching products.</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ card: { paddingVertical: 12 }, title: { color: '#24332A', fontWeight: '700', fontSize: 16 }, hint: { color: '#737B77', lineHeight: 20, marginTop: 6 }, label: { color: '#24332A', fontWeight: '600', marginTop: 14, marginBottom: 8 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderWidth: 1, borderColor: '#D5DAD7', borderRadius: 10, padding: 12 }, selected: { backgroundColor: '#E7F2ED', borderColor: '#176B50' }, text: { color: '#24332A' }, input: { borderWidth: 1, borderColor: '#D5DAD7', borderRadius: 10, padding: 12 }, product: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 1, borderColor: '#EAEDEB' } });
