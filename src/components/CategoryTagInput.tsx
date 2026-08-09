import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '../theme/tokens';
import type { Category } from '../types';

type Props = {
  allCategories: Category[];
  selectedIds: string[];
  onToggle: (categoryId: string) => void;
  onCreate: (name: string) => void;
};

export function CategoryTagInput({ allCategories, selectedIds, onToggle, onCreate }: Props) {
  const [draft, setDraft] = useState('');

  function submitDraft() {
    const name = draft.trim();
    if (!name) return;
    onCreate(name);
    setDraft('');
  }

  return (
    <View style={styles.wrap}>
      {allCategories.length > 0 && (
        <View style={styles.chipRow}>
          {allCategories.map((category) => {
            const active = selectedIds.includes(category.id);
            return (
              <Pressable key={category.id} onPress={() => onToggle(category.id)}>
                <Text style={active ? styles.chipActive : styles.chip}>{category.name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="새 카테고리 추가"
          onSubmitEditing={submitDraft}
          returnKeyType="done"
        />
        <Pressable onPress={submitDraft}>
          <Text style={styles.addLabel}>추가</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    fontSize: 11,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.sageOlive,
    color: colors.sageOlive,
    overflow: 'hidden',
  },
  chipActive: {
    fontSize: 11,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.sageOlive,
    backgroundColor: colors.sageOlive,
    color: colors.paper,
    overflow: 'hidden',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
    paddingVertical: 6,
    color: colors.ink,
  },
  addLabel: { fontSize: 12, color: colors.stampRed },
});
