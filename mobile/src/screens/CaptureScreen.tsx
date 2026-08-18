import React, { useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { colors, font, radius, spacing } from '../theme';
import { Header } from '../components/Header';
import { Button, Card, SectionTitle, Tag } from '../components/ui';
import { MacroRow } from '../components/Macros';
import { NutrientChips } from '../components/Nutrition';
import {
  ApiError,
  analyzeCapture,
  createMeal,
  type CaptureDraft,
  type CaptureSource,
  type Meal,
  type MealItemInput,
  type MealType,
} from '../api';
import { capitalize, round, withCommas } from '../utils/format';

type SourceOption = 'phone' | 'glasses';
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Client-side editable representation of a draft item. */
interface EditItem {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  /** Draft-estimated calories for this row (display only; recomputed on save). */
  calories?: number;
}

export function CaptureScreen() {
  const [source, setSource] = useState<SourceOption>('phone');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [mealType, setMealType] = useState<MealType | undefined>(undefined);
  const [location, setLocation] = useState('');
  // Chosen log time. `null` means "now" — we resolve a fresh `new Date()` on save
  // so an unedited draft is stamped at save time, not when the screen mounted.
  const [eatenAt, setEatenAt] = useState<Date | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [items, setItems] = useState<EditItem[]>([]);
  const [draftMealType, setDraftMealType] = useState<MealType>('lunch');
  const [draftLocation, setDraftLocation] = useState('');

  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<Meal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keyCounter = useRef(0);

  const nextKey = () => `new-${keyCounter.current++}`;

  // Camera captures one shot at a time (keeps allowsEditing so the user can crop);
  // each is appended to the meal's photo list.
  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission needed', 'Enable camera access in Settings to take a photo.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (!res.canceled) setImageUris((prev) => [...prev, res.assets[0].uri]);
  };

  // The library allows multi-select. `allowsEditing` is mutually exclusive with
  // `allowsMultipleSelection` (SDK 57), so we drop cropping here and append all.
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos permission needed', 'Enable photo library access in Settings to pick an image.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!res.canceled) setImageUris((prev) => [...prev, ...res.assets.map((a) => a.uri)]);
  };

  const removePhoto = (index: number) => {
    setImageUris((prev) => prev.filter((_, i) => i !== index));
  };

  const clearPhotos = () => setImageUris([]);

  const resetAll = () => {
    setImageUris([]);
    setNote('');
    setMealType(undefined);
    setLocation('');
    setEatenAt(null);
    setDraft(null);
    setItems([]);
    setSaved(null);
    setError(null);
  };

  const backToForm = () => {
    setDraft(null);
    setItems([]);
    setError(null);
  };

  const analyze = async () => {
    if (!note.trim() && imageUris.length === 0) {
      Alert.alert('Add something', 'Add a note describing what you ate (or attach a photo).');
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const d = await analyzeCapture({
        photoUris: source === 'phone' ? imageUris : [],
        note: note.trim() || undefined,
        meal_type: mealType,
        location: location.trim() || undefined,
        source: source as CaptureSource,
      });
      setDraft(d);
      setDraftMealType(d.meal_type);
      setDraftLocation(d.location ?? location.trim());
      setItems(
        d.items.map((it) => ({
          key: it.id,
          name: it.canonical_name,
          quantity: String(round(it.quantity, 2)),
          unit: it.unit ?? '',
          calories: it.calories,
        })),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not analyze the meal. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const updateItem = (key: string, patch: Partial<EditItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { key: nextKey(), name: '', quantity: '1', unit: '' }]);
  };

  const confirm = async () => {
    const payloadItems: MealItemInput[] = items
      .map((it) => ({
        name: it.name.trim(),
        quantity: Number(it.quantity) || 1,
        unit: it.unit.trim() || null,
      }))
      .filter((it) => it.name.length > 0);
    if (!payloadItems.length) {
      setError('Add at least one item with a name before saving.');
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      const meal = await createMeal({
        meal_type: draftMealType,
        items: payloadItems,
        location: draftLocation.trim() || null,
        note: note.trim() || null,
        source: source as CaptureSource,
        photo_uri: draft?.photo_uri ?? null,
        // `null` means "now": resolve a fresh timestamp at save time. A chosen
        // wall-clock Date is sent as UTC ISO; the backend normalizes to naive UTC.
        eaten_at: (eatenAt ?? new Date()).toISOString(),
      });
      setSaved(meal);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the meal. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const phase: 'form' | 'draft' | 'saved' = saved ? 'saved' : draft ? 'draft' : 'form';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header
        title="Capture"
        subtitle={
          phase === 'draft'
            ? 'Review & edit before saving'
            : phase === 'saved'
              ? 'Saved to your food memory'
              : 'Log a meal from any source'
        }
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {phase === 'saved' && saved ? (
            <SavedMeal meal={saved} onAgain={resetAll} />
          ) : phase === 'draft' && draft ? (
            <DraftEditor
              draft={draft}
              items={items}
              mealType={draftMealType}
              location={draftLocation}
              onMealType={setDraftMealType}
              onLocation={setDraftLocation}
              onUpdateItem={updateItem}
              onRemoveItem={removeItem}
              onAddItem={addItem}
              onConfirm={confirm}
              onBack={backToForm}
              confirming={confirming}
              error={error}
            />
          ) : (
            <CaptureForm
              source={source}
              imageUris={imageUris}
              note={note}
              mealType={mealType}
              location={location}
              eatenAt={eatenAt}
              analyzing={analyzing}
              error={error}
              onSource={setSource}
              onNote={setNote}
              onMealType={setMealType}
              onLocation={setLocation}
              onEatenAt={setEatenAt}
              onTakePhoto={takePhoto}
              onPickImage={pickImage}
              onRemovePhoto={removePhoto}
              onClearPhotos={clearPhotos}
              onAnalyze={analyze}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — capture form
// ---------------------------------------------------------------------------
function CaptureForm(props: {
  source: SourceOption;
  imageUris: string[];
  note: string;
  mealType: MealType | undefined;
  location: string;
  eatenAt: Date | null;
  analyzing: boolean;
  error: string | null;
  onSource: (s: SourceOption) => void;
  onNote: (v: string) => void;
  onMealType: (v: MealType | undefined) => void;
  onLocation: (v: string) => void;
  onEatenAt: (v: Date | null) => void;
  onTakePhoto: () => void;
  onPickImage: () => void;
  onRemovePhoto: (index: number) => void;
  onClearPhotos: () => void;
  onAnalyze: () => void;
}) {
  const { source, imageUris, note, mealType, location, eatenAt, analyzing, error } = props;
  return (
    <>
      <SectionTitle>Capture source</SectionTitle>
      <View style={styles.segment}>
        <SegmentButton label="📷  Phone camera" active={source === 'phone'} onPress={() => props.onSource('phone')} />
        <SegmentButton label="🕶️  Glasses" active={source === 'glasses'} onPress={() => props.onSource('glasses')} />
      </View>
      <Text style={styles.hint}>
        Bite is capture-source agnostic. Photos come from your phone today; the same pipeline accepts a
        stream from AI glasses.
      </Text>

      {source === 'phone' ? (
        <Card style={styles.block}>
          {imageUris.length > 0 ? (
            <View>
              <Text style={styles.photoCount}>
                {imageUris.length} photo{imageUris.length === 1 ? '' : 's'} · the dish + any ingredients
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbRow}
              >
                {imageUris.map((uri, i) => (
                  <View key={`${uri}-${i}`} style={styles.thumbWrap}>
                    <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                    <TouchableOpacity
                      onPress={() => props.onRemovePhoto(i)}
                      style={styles.thumbRemove}
                      hitSlop={8}
                    >
                      <Text style={styles.thumbRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.photoActionsRow}>
                <Button title="📸 Take photo" onPress={props.onTakePhoto} variant="secondary" style={styles.photoActionBtn} />
                <Button title="🖼️ Add from library" onPress={props.onPickImage} variant="secondary" style={styles.photoActionBtn} />
              </View>
              <TouchableOpacity onPress={props.onClearPhotos} style={styles.clearPhoto}>
                <Text style={styles.clearPhotoText}>Remove all photos</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.photoButtons}>
              <Button title="📸 Take photo" onPress={props.onTakePhoto} style={styles.photoBtn} />
              <Button title="🖼️ Choose from library" onPress={props.onPickImage} variant="secondary" style={styles.photoBtn} />
            </View>
          )}
        </Card>
      ) : (
        <Card style={[styles.block, styles.prototype]}>
          <View style={styles.protoBadge}>
            <Text style={styles.protoBadgeText}>PROTOTYPE · COMING SOON</Text>
          </View>
          <Text style={styles.protoTitle}>🕶️ Ray-Ban Meta glasses</Text>
          <Text style={styles.protoBody}>
            In the full product, a hands-free capture streams the photo + your spoken note straight from the
            glasses. Meta SDK integration is out of scope for this build, so no live capture here — but you
            can still log the meal below and it will be tagged as a <Text style={styles.bold}>glasses</Text>{' '}
            capture to prove the source abstraction.
          </Text>
        </Card>
      )}

      <SectionTitle style={styles.sectionSpacing}>What did you eat?</SectionTitle>
      <TextInput
        style={styles.input}
        placeholder="grabbed a burrito and an iced coffee"
        placeholderTextColor={colors.textFaint}
        value={note}
        onChangeText={props.onNote}
        multiline
      />

      <SectionTitle style={styles.sectionSpacing}>Location (optional)</SectionTitle>
      <TextInput
        style={styles.inputSingle}
        placeholder="Chipotle (Downtown)"
        placeholderTextColor={colors.textFaint}
        value={location}
        onChangeText={props.onLocation}
      />

      <SectionTitle style={styles.sectionSpacing}>Meal type (optional)</SectionTitle>
      <View style={styles.mealTypeRow}>
        <MealTypeChip label="Auto" active={mealType === undefined} onPress={() => props.onMealType(undefined)} />
        {MEAL_TYPES.map((mt) => (
          <MealTypeChip key={mt} label={capitalize(mt)} active={mealType === mt} onPress={() => props.onMealType(mt)} />
        ))}
      </View>

      <SectionTitle style={styles.sectionSpacing}>When</SectionTitle>
      <Text style={styles.hint}>Defaults to now — set it back to log an earlier meal.</Text>
      <WhenPicker value={eatenAt} onChange={props.onEatenAt} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Analyze meal" onPress={props.onAnalyze} loading={analyzing} style={styles.submit} />
      <Text style={styles.disclaimer}>
        Analysis is stubbed on the backend (no real vision model). It matches keywords in your note against a
        food catalog. You'll be able to edit every item before saving.
      </Text>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — editable draft
// ---------------------------------------------------------------------------
function DraftEditor(props: {
  draft: CaptureDraft;
  items: EditItem[];
  mealType: MealType;
  location: string;
  onMealType: (v: MealType) => void;
  onLocation: (v: string) => void;
  onUpdateItem: (key: string, patch: Partial<EditItem>) => void;
  onRemoveItem: (key: string) => void;
  onAddItem: () => void;
  onConfirm: () => void;
  onBack: () => void;
  confirming: boolean;
  error: string | null;
}) {
  const { draft, items, mealType, location, confirming, error } = props;
  return (
    <View>
      <Card style={[styles.block, styles.extractorCard]}>
        <Text style={styles.extractorLabel}>Draft · how this was extracted</Text>
        <Text style={styles.extractorNote}>{draft.extraction_note}</Text>
        {draft.photo_count && draft.photo_count > 1 ? (
          <Text style={styles.extractorSub}>Combined {draft.photo_count} photos into one meal.</Text>
        ) : null}
        <Text style={styles.extractorSub}>{draft.extractor}</Text>
      </Card>

      <SectionTitle>Meal type</SectionTitle>
      <View style={styles.mealTypeRow}>
        {MEAL_TYPES.map((mt) => (
          <MealTypeChip key={mt} label={capitalize(mt)} active={mealType === mt} onPress={() => props.onMealType(mt)} />
        ))}
      </View>

      <SectionTitle style={styles.sectionSpacing}>Location (optional)</SectionTitle>
      <TextInput
        style={styles.inputSingle}
        placeholder="Where did you eat?"
        placeholderTextColor={colors.textFaint}
        value={location}
        onChangeText={props.onLocation}
      />

      <SectionTitle style={styles.sectionSpacing}>Items ({items.length})</SectionTitle>
      {items.map((it) => (
        <Card key={it.key} style={styles.editItem}>
          <View style={styles.editNameRow}>
            <TextInput
              style={styles.editName}
              placeholder="Item name"
              placeholderTextColor={colors.textFaint}
              value={it.name}
              onChangeText={(v) => props.onUpdateItem(it.key, { name: v })}
            />
            <TouchableOpacity onPress={() => props.onRemoveItem(it.key)} style={styles.removeBtn} hitSlop={8}>
              <Text style={styles.removeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.editMetaRow}>
            <View style={styles.qtyWrap}>
              <Text style={styles.miniLabel}>Qty</Text>
              <TextInput
                style={styles.qtyInput}
                placeholder="1"
                placeholderTextColor={colors.textFaint}
                keyboardType="numeric"
                value={it.quantity}
                onChangeText={(v) => props.onUpdateItem(it.key, { quantity: v })}
              />
            </View>
            <View style={styles.unitWrap}>
              <Text style={styles.miniLabel}>Unit</Text>
              <TextInput
                style={styles.unitInput}
                placeholder="serving"
                placeholderTextColor={colors.textFaint}
                value={it.unit}
                onChangeText={(v) => props.onUpdateItem(it.key, { unit: v })}
              />
            </View>
            {it.calories != null ? <Text style={styles.editCal}>≈ {it.calories} cal</Text> : null}
          </View>
        </Card>
      ))}

      <TouchableOpacity onPress={props.onAddItem} style={styles.addItem} activeOpacity={0.8}>
        <Text style={styles.addItemText}>＋ Add item</Text>
      </TouchableOpacity>

      <Card style={[styles.block, styles.estCard]}>
        <Text style={styles.estLabel}>Estimated totals (draft)</Text>
        <MacroRow
          calories={draft.total_calories}
          protein={draft.total_protein_g}
          carbs={draft.total_carbs_g}
          fat={draft.total_fat_g}
          variant="full"
        />
        <Text style={styles.estHint}>Final nutrition is recomputed server-side from your edits when you save.</Text>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Save meal" onPress={props.onConfirm} loading={confirming} style={styles.submit} />
      <Button title="Start over" onPress={props.onBack} variant="secondary" style={styles.secondaryBtn} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — saved confirmation
// ---------------------------------------------------------------------------
function SavedMeal({ meal, onAgain }: { meal: Meal; onAgain: () => void }) {
  return (
    <View>
      <View style={styles.successHeader}>
        <Text style={styles.successEmoji}>✅</Text>
        <Text style={styles.successTitle}>Meal saved</Text>
      </View>

      <Card style={styles.block}>
        {meal.photo_uri ? (
          <Image source={{ uri: meal.photo_uri }} style={styles.resultPhoto} resizeMode="cover" />
        ) : null}
        <Text style={styles.resultDesc}>{meal.description}</Text>

        <View style={styles.itemsWrap}>
          {meal.items.map((it) => (
            <View key={it.id} style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <Text style={styles.itemName}>{it.canonical_name}</Text>
                <Text style={styles.itemMeta}>
                  {round(it.quantity, 2)} {it.unit ?? ''} · {round(it.protein_g, 1)}g P
                </Text>
              </View>
              <Text style={styles.itemCal}>{it.calories} cal</Text>
            </View>
          ))}
        </View>

        <View style={styles.macrosWrap}>
          <MacroRow
            calories={meal.total_calories}
            protein={meal.total_protein_g}
            carbs={meal.total_carbs_g}
            fat={meal.total_fat_g}
            variant="full"
          />
        </View>

        <View style={styles.microsWrap}>
          <NutrientChips
            items={[
              { label: 'Fiber', value: `${round(meal.total_fiber_g, 1)}g` },
              { label: 'Sugar', value: `${round(meal.total_sugar_g, 1)}g` },
              { label: 'Sodium', value: `${withCommas(meal.total_sodium_mg)}mg` },
              { label: 'Sat fat', value: `${round(meal.total_satfat_g, 1)}g` },
            ]}
          />
        </View>

        {meal.tags.length ? (
          <View style={styles.tagRow}>
            {meal.tags.map((t) => (
              <Tag key={t} label={t} />
            ))}
          </View>
        ) : null}
      </Card>

      <Button title="Log another meal" onPress={onAgain} style={styles.submit} />
    </View>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[styles.segmentBtn, active && styles.segmentBtnActive]}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function MealTypeChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[styles.mtChip, active && styles.mtChipActive]}>
      <Text style={[styles.mtChipText, active && styles.mtChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// "When" picker — plain-RN fallback (no @react-native-community/datetimepicker
// dependency, which would need a native rebuild). Quick presets plus day/hour/
// minute steppers, all yielding a JS Date the caller turns into an ISO string.
// ---------------------------------------------------------------------------
const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Human label like "Today, 2:45 PM" / "Yesterday, 9:05 AM" / "Aug 12, 7:30 PM". */
function formatWhen(d: Date): string {
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  const today = new Date();
  const yesterday = new Date(today.getTime() - MS_DAY);
  const day =
    d.toDateString() === today.toDateString()
      ? 'Today'
      : d.toDateString() === yesterday.toDateString()
        ? 'Yesterday'
        : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return `${day}, ${h}:${mm} ${ampm}`;
}

function WhenPicker({ value, onChange }: { value: Date | null; onChange: (d: Date | null) => void }) {
  // `null` == "now"; show a live now for display and as the base for edits.
  const effective = value ?? new Date();
  const isNow = value === null;
  const preset = (msAgo: number) => onChange(new Date(Date.now() - msAgo));
  const shift = (ms: number) => onChange(new Date(effective.getTime() + ms));
  const shiftDay = (days: number) => {
    const d = new Date(effective);
    d.setDate(d.getDate() + days);
    onChange(d);
  };
  return (
    <View>
      <View style={styles.whenSummaryRow}>
        <Text style={styles.whenSummary}>{formatWhen(effective)}</Text>
        {isNow ? <Text style={styles.whenNowTag}>now</Text> : null}
      </View>
      <View style={styles.mealTypeRow}>
        <MealTypeChip label="Now" active={isNow} onPress={() => onChange(null)} />
        <MealTypeChip label="1h ago" active={false} onPress={() => preset(MS_HOUR)} />
        <MealTypeChip label="2h ago" active={false} onPress={() => preset(2 * MS_HOUR)} />
        <MealTypeChip label="Yesterday" active={false} onPress={() => preset(MS_DAY)} />
      </View>
      <View style={styles.stepperRow}>
        <Stepper label="Day" onMinus={() => shiftDay(-1)} onPlus={() => shiftDay(1)} />
        <Stepper label="Hour" onMinus={() => shift(-MS_HOUR)} onPlus={() => shift(MS_HOUR)} />
        <Stepper label="Min" onMinus={() => shift(-5 * MS_MIN)} onPlus={() => shift(5 * MS_MIN)} />
      </View>
    </View>
  );
}

function Stepper({ label, onMinus, onPlus }: { label: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity onPress={onMinus} style={styles.stepBtn} hitSlop={6} activeOpacity={0.7}>
        <Text style={styles.stepBtnText}>−</Text>
      </TouchableOpacity>
      <Text style={styles.stepLabel}>{label}</Text>
      <TouchableOpacity onPress={onPlus} style={styles.stepBtn} hitSlop={6} activeOpacity={0.7}>
        <Text style={styles.stepBtnText}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  block: { marginBottom: spacing.lg },
  sectionSpacing: { marginTop: spacing.lg },

  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4 },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segmentText: { fontSize: font.small, fontWeight: '700', color: colors.textMuted },
  segmentTextActive: { color: colors.primary },
  hint: { fontSize: font.small, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.lg, lineHeight: 19 },

  photoButtons: { gap: spacing.md },
  photoBtn: {},
  clearPhoto: { marginTop: spacing.md, alignSelf: 'center' },
  clearPhotoText: { color: colors.danger, fontSize: font.small, fontWeight: '700' },

  // multi-photo thumbnails
  photoCount: { fontSize: font.tiny, color: colors.textMuted, fontWeight: '700', marginBottom: spacing.sm },
  thumbRow: { gap: spacing.sm, paddingRight: spacing.sm },
  thumbWrap: { position: 'relative' },
  thumb: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  thumbRemoveText: { color: '#fff', fontSize: font.tiny, fontWeight: '800' },
  photoActionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  photoActionBtn: { flex: 1 },

  // "when" picker
  whenSummaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  whenSummary: { fontSize: font.body, fontWeight: '800', color: colors.text },
  whenNowTag: {
    marginLeft: spacing.sm,
    fontSize: font.tiny,
    fontWeight: '800',
    color: colors.primaryDark,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  stepperRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: font.body, fontWeight: '800', color: colors.primary },
  stepLabel: { fontSize: font.tiny, fontWeight: '700', color: colors.textMuted },

  prototype: { borderStyle: 'dashed', borderColor: colors.glasses, backgroundColor: colors.glassesSoft },
  protoBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.glasses,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginBottom: spacing.sm,
  },
  protoBadgeText: { color: '#fff', fontSize: font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  protoTitle: { fontSize: font.h3, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  protoBody: { fontSize: font.small, color: colors.textMuted, lineHeight: 20 },
  bold: { fontWeight: '800', color: colors.glasses },

  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.body,
    color: colors.text,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  inputSingle: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.body,
    color: colors.text,
  },
  mealTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mtChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mtChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  mtChipText: { fontSize: font.small, fontWeight: '600', color: colors.textMuted },
  mtChipTextActive: { color: colors.primaryDark },

  error: { color: colors.danger, fontSize: font.small, marginTop: spacing.lg, fontWeight: '600' },
  submit: { marginTop: spacing.xl },
  secondaryBtn: { marginTop: spacing.md },
  disclaimer: { fontSize: font.tiny, color: colors.textFaint, marginTop: spacing.md, lineHeight: 16, textAlign: 'center' },

  // draft editor
  extractorCard: { backgroundColor: colors.surfaceAlt },
  extractorLabel: { fontSize: font.tiny, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.xs },
  extractorNote: { fontSize: font.small, color: colors.text, lineHeight: 19 },
  extractorSub: { fontSize: font.tiny, color: colors.textFaint, marginTop: spacing.sm, fontStyle: 'italic' },
  editItem: { padding: spacing.md, marginBottom: spacing.md },
  editNameRow: { flexDirection: 'row', alignItems: 'center' },
  editName: {
    flex: 1,
    fontSize: font.body,
    fontWeight: '700',
    color: colors.text,
    paddingVertical: spacing.xs,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  removeBtnText: { fontSize: font.small, fontWeight: '800', color: colors.textMuted },
  editMetaRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.sm, gap: spacing.md },
  qtyWrap: { width: 68 },
  unitWrap: { flex: 1 },
  miniLabel: { fontSize: font.tiny, color: colors.textMuted, fontWeight: '700', marginBottom: 3 },
  qtyInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: font.small,
    color: colors.text,
    fontWeight: '700',
  },
  unitInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: font.small,
    color: colors.text,
  },
  editCal: { fontSize: font.small, fontWeight: '800', color: colors.calories, paddingBottom: spacing.sm },
  addItem: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  addItemText: { fontSize: font.small, fontWeight: '800', color: colors.primary },
  estCard: { backgroundColor: colors.surfaceAlt },
  estLabel: { fontSize: font.tiny, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.md },
  estHint: { fontSize: font.tiny, color: colors.textFaint, marginTop: spacing.md, lineHeight: 16, textAlign: 'center' },

  // saved
  successHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  successEmoji: { fontSize: 26, marginRight: spacing.sm },
  successTitle: { fontSize: font.h2, fontWeight: '800', color: colors.text },
  resultPhoto: { width: '100%', height: 180, borderRadius: radius.md, marginBottom: spacing.md, backgroundColor: colors.surfaceAlt },
  resultDesc: { fontSize: font.body, fontWeight: '700', color: colors.text, marginBottom: spacing.md, lineHeight: 21 },
  itemsWrap: { gap: spacing.sm, marginBottom: spacing.md },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
  },
  itemLeft: { flex: 1, paddingRight: spacing.sm },
  itemName: { fontSize: font.body, fontWeight: '600', color: colors.text },
  itemMeta: { fontSize: font.tiny, color: colors.textMuted, marginTop: 1 },
  itemCal: { fontSize: font.small, fontWeight: '700', color: colors.calories },
  macrosWrap: { marginBottom: spacing.md },
  microsWrap: { marginBottom: spacing.md },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
