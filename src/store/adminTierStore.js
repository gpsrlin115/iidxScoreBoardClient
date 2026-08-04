import { create } from 'zustand';
import { tierApi } from '../api/tiers';
import toast from 'react-hot-toast';
import { normalizeTierCategory } from '../utils/tierData';
import { toAppError } from '../utils/httpError';
import { DEFAULT_DIFFICULTY, loadAdminTierSources } from './adminTierLoader';

const TIERS = ['S+', 'S', 'A+', 'A', 'B+', 'B', 'C', 'D', 'E', 'F'];
const CATEGORIES = ['地力', '個人差'];

let latestAdminTierRequestId = 0;

const buildSectionKeys = () => TIERS.flatMap((tier) => CATEGORIES.map((category) => `${category}|${tier}`));

// Builds an empty tier map used as the initial state for the editor
const buildEmptyDraftTierData = () => Object.fromEntries(buildSectionKeys().map((key) => [key, []]));

const buildItemId = (title, difficulty) => `${title}__${difficulty ?? 'NONE'}`;

const toAdminItem = (item, fallback = {}) => {
  return {
    id: buildItemId(item.title ?? fallback.title, item.difficulty ?? fallback.difficulty ?? null),
    title: item.title ?? fallback.title,
    difficulty: item.difficulty ?? fallback.difficulty ?? null,
    category: normalizeTierCategory(item.category ?? fallback.category),
    tier: item.tier ?? fallback.tier ?? null,
    sortOrder: item.sortOrder ?? fallback.sortOrder ?? null
  };
};

const useAdminTierStore = create((set, get) => ({
  selectedLevel: 12,
  selectedPlayStyle: 'SP',
  editorTierData: buildEmptyDraftTierData(),
  unassignedSongs: [],
  rawTierData: [],
  hasChanges: false,
  isLoading: false,
  isSaving: false,
  error: null,

  setLevel: (level) => {
    latestAdminTierRequestId += 1;
    set({ selectedLevel: level, hasChanges: false });
  },
  setPlayStyle: (style) => {
    latestAdminTierRequestId += 1;
    set({ selectedPlayStyle: style, hasChanges: false });
  },

  fetchDataForEdit: async () => {
    const { selectedLevel, selectedPlayStyle } = get();
    const requestId = ++latestAdminTierRequestId;
    const isCurrentRequest = () => (
      requestId === latestAdminTierRequestId
      && get().selectedLevel === selectedLevel
      && get().selectedPlayStyle === selectedPlayStyle
    );
    set({ isLoading: true, error: null, hasChanges: false });

    try {
      const sources = await loadAdminTierSources(selectedLevel, selectedPlayStyle);
      if (!isCurrentRequest()) return;

      if (sources.authFailure) {
        const appError = toAppError(sources.authFailure);
        console.error(sources.context, sources.authFailure);
        set({ error: appError, isLoading: false });
        toast.error(appError.message);
        return;
      }

      const { rawEntries: rawArray, masterSongs, usedFallbackData } = sources;
      const safeTiers = buildEmptyDraftTierData();

      // 1. 할당된 곡들을 카테고리|티어 별로 분류
      rawArray.forEach((item) => {
        if (item.category && item.tier && TIERS.includes(item.tier) && CATEGORIES.includes(item.category)) {
          const key = `${item.category}|${item.tier}`;
          safeTiers[key].push(toAdminItem(item));
        }
      });

      // 2. 각 티어 내부 정렬 (sortOrder 기준, 보조적으로 제목 순)
      Object.keys(safeTiers).forEach((key) => {
        safeTiers[key].sort((a, b) => {
          const orderDiff = (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER);
          if (orderDiff !== 0) return orderDiff;
          return a.title.localeCompare(b.title);
        });
      });

      // 3. 이미 할당되었거나 드래프트에 포함된 ID 추적
      const assignedIds = new Set();
      Object.values(safeTiers).forEach((songArray) => {
        songArray.forEach((song) => assignedIds.add(song.id));
      });

      // 4. 드래프트에는 있으나 카테고리/티어가 없는 곡 (Unassigned 영역으로 이동)
      const draftUnassigned = rawArray
        .filter((item) => !item.category || !item.tier || !TIERS.includes(item.tier) || !CATEGORIES.includes(item.category))
        .map((item) => toAdminItem(item));

      draftUnassigned.forEach((item) => assignedIds.add(item.id));

      // 5. 마스터 곡 목록 중 드래프트에 아예 없는 곡들 추출
      const allSongItems = masterSongs.map((song) => toAdminItem(song, { difficulty: song.difficulty ?? DEFAULT_DIFFICULTY }));
      const newMasterSongs = allSongItems.filter((song) => !assignedIds.has(song.id));

      set({
        editorTierData: safeTiers,
        unassignedSongs: [...draftUnassigned, ...newMasterSongs],
        rawTierData: rawArray,
        isLoading: false
      });

      // Saving would write this substitute data over the live table, so the
      // admin has to know the editor is not showing the real thing.
      if (usedFallbackData) {
        toast('관리자 데이터가 비어 있어 기본 데이터로 표시 중입니다.', { icon: 'ℹ️' });
      }
    } catch (error) {
      if (!isCurrentRequest()) return;
      const appError = toAppError(error, { fallback: '편집기 데이터를 불러오지 못했습니다.' });
      console.error('Failed to load data for editor:', error);
      set({ error: appError, isLoading: false });
      toast.error(appError.message);
    }
  },

  updateDraftState: (newTiers, newUnassigned) => {
    set({
      editorTierData: newTiers,
      unassignedSongs: newUnassigned,
      hasChanges: true
    });
  },

  // Transient update for drag-over previews: must not flip hasChanges,
  // so a cancelled drag can restore the snapshot without marking the draft dirty.
  setDraftPreview: (newTiers, newUnassigned) => {
    set({
      editorTierData: newTiers,
      unassignedSongs: newUnassigned
    });
  },

  buildArrayPayload: () => {
    const { editorTierData, unassignedSongs } = get();
    const payload = [];
    let sortOrder = 1;

    // 화면 렌더링 순서(Tier -> Category)와 동일하게 Loop 구성하여 sortOrder 부여
    TIERS.forEach((tier) => {
      CATEGORIES.forEach((category) => {
        const key = `${category}|${tier}`;
        const items = editorTierData[key] || [];
        items.forEach((item) => {
          payload.push({
            title: item.title,
            difficulty: item.difficulty ?? DEFAULT_DIFFICULTY,
            category,
            tier,
            sortOrder: sortOrder++
          });
        });
      });
    });

    // 미할당 곡들도 페이로드에 포함 (category/tier null)
    unassignedSongs.forEach((item) => {
      payload.push({
        title: item.title,
        difficulty: item.difficulty ?? DEFAULT_DIFFICULTY,
        category: null,
        tier: null,
        sortOrder: null
      });
    });

    return payload;
  },

  saveChanges: async () => {
    const { selectedLevel, selectedPlayStyle, hasChanges } = get();

    if (!hasChanges) {
      toast('No changes to save', { icon: 'ℹ️' });
      return;
    }

    set({ isSaving: true });
    try {
      const payload = get().buildArrayPayload();
      // saveAdminTierDraft writes directly to live; no separate publish step required
      await tierApi.saveAdminTierDraft(selectedLevel, selectedPlayStyle, payload);
      toast.success('Changes saved! Now live.');
      set({ isSaving: false, hasChanges: false, rawTierData: payload });
    } catch (error) {
      set({ isSaving: false });
      toast.error(toAppError(error, { fallback: '변경사항 저장에 실패했습니다.' }).message);
    }
  },

  publishChanges: async () => {
    const { selectedLevel, selectedPlayStyle } = get();

    set({ isSaving: true });
    try {
      const payload = get().buildArrayPayload();
      // publishTierTable is a backward-compatible alias; behaves identically to saveAdminTierDraft
      await tierApi.publishTierTable(selectedLevel, selectedPlayStyle, payload);
      toast.success('Changes saved! Now live.');
      set({ isSaving: false, hasChanges: false, rawTierData: payload });
    } catch (error) {
      set({ isSaving: false });
      toast.error(toAppError(error, { fallback: '서열표 반영에 실패했습니다.' }).message);
    }
  }
}));

export { TIERS, CATEGORIES, buildItemId, buildSectionKeys };
export default useAdminTierStore;
