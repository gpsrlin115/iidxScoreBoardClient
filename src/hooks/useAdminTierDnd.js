import { useCallback, useEffect, useRef, useState } from 'react';
import {
  closestCenter,
  pointerWithin,
  rectIntersection,
  getFirstCollision,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import useAdminTierStore from '../store/adminTierStore';
import { sortSongsByTitle } from '../utils/tierData';
import { isDropOutsideEveryContainer, resolveDropTarget } from '../utils/adminDndCollision';

const UNASSIGNED_ID = 'unassigned';

const isContainerId = (id, tierData) =>
  id === UNASSIGNED_ID || Object.prototype.hasOwnProperty.call(tierData, id);

const findContainer = (id, tierData, unassigned) => {
  if (isContainerId(id, tierData)) return id;
  if (unassigned.some((song) => song.id === id)) return UNASSIGNED_ID;
  for (const [key, songs] of Object.entries(tierData)) {
    if (songs.some((song) => song.id === id)) return key;
  }
  return null;
};

const getContainerItems = (container, tierData, unassigned) =>
  container === UNASSIGNED_ID ? unassigned : tierData[container] ?? [];

// Every write goes through here, so sorting once keeps the A-Z invariant that
// the editor and the viewer both rely on.
const applyContainers = (tierData, unassigned, changes) => {
  const newTiers = { ...tierData };
  let newUnassigned = unassigned;
  for (const [container, items] of Object.entries(changes)) {
    const sorted = sortSongsByTitle(items);
    if (container === UNASSIGNED_ID) newUnassigned = sorted;
    else newTiers[container] = sorted;
  }
  return { newTiers, newUnassigned };
};

/**
 * useAdminTierDnd
 * Drag-and-drop handlers for the admin tier editor, ported from dnd-kit's
 * official MultipleContainers pattern. Items are moved into the hovered
 * container during onDragOver so the drop target is previewed in real time;
 * onDragEnd only marks the draft as changed.
 *
 * A drop decides which container a song belongs to — never its position inside
 * one. Each container is kept sorted by title, so where the pointer lands
 * within a tier is irrelevant and manual reordering inside a tier is a no-op.
 */
const useAdminTierDnd = () => {
  const [activeId, setActiveId] = useState(null);

  // Pre-drag snapshot used to restore state on cancel / invalid drop.
  const snapshotRef = useRef(null);
  // True once the active item changed containers during this drag.
  const movedAcrossContainers = useRef(false);
  // Guards against collision-detection flicker right after a container switch.
  const recentlyMovedToNewContainer = useRef(false);
  // True when the last reported target was the grace-frame stand-in rather than
  // a real collision. dnd-kit still reports it as `over`, so onDragEnd needs
  // this to tell an actual drop from a release outside every container.
  const lastTargetWasSubstitute = useRef(false);

  const editorTierData = useAdminTierStore((state) => state.editorTierData);
  const unassignedSongs = useAdminTierStore((state) => state.unassignedSongs);

  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }, [editorTierData, unassignedSongs]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // pointerWithin keeps the hovered tier authoritative (closestCenter alone can
  // pick an item in a neighboring tier), then narrows down to the closest item
  // inside that container.
  const collisionDetectionStrategy = useCallback((args) => {
    const { editorTierData: tierData, unassignedSongs: unassigned } = useAdminTierStore.getState();

    const pointerIntersections = pointerWithin(args);
    const intersections = pointerIntersections.length > 0 ? pointerIntersections : rectIntersection(args);
    let overId = getFirstCollision(intersections, 'id');

    if (overId != null) {
      if (isContainerId(overId, tierData)) {
        const containerItems = getContainerItems(overId, tierData, unassigned);
        if (containerItems.length > 0) {
          const itemIds = new Set(containerItems.map((song) => song.id));
          const closestItem = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter(
              (container) => container.id !== overId && itemIds.has(container.id)
            )
          });
          overId = closestItem[0]?.id ?? overId;
        }
      }
    }

    const target = resolveDropTarget({
      collisionId: overId,
      activeId: args.active.id,
      recentlyMovedToNewContainer: recentlyMovedToNewContainer.current
    });
    lastTargetWasSubstitute.current = target.id != null && !target.isRealCollision;
    return target.id != null ? [{ id: target.id }] : [];
  }, []);

  const cleanupDragRefs = () => {
    snapshotRef.current = null;
    movedAcrossContainers.current = false;
    lastTargetWasSubstitute.current = false;
  };

  const restoreSnapshot = () => {
    if (!snapshotRef.current) return;
    const { setDraftPreview } = useAdminTierStore.getState();
    setDraftPreview(snapshotRef.current.tierData, snapshotRef.current.unassigned);
  };

  const handleDragStart = ({ active }) => {
    const { editorTierData: tierData, unassignedSongs: unassigned } = useAdminTierStore.getState();
    snapshotRef.current = { tierData, unassigned };
    movedAcrossContainers.current = false;
    setActiveId(active.id);
  };

  const handleDragOver = ({ active, over }) => {
    const overId = over?.id;
    if (overId == null) return;

    const {
      editorTierData: tierData,
      unassignedSongs: unassigned,
      setDraftPreview
    } = useAdminTierStore.getState();

    const activeContainer = findContainer(active.id, tierData, unassigned);
    const overContainer = findContainer(overId, tierData, unassigned);
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    const activeItems = getContainerItems(activeContainer, tierData, unassigned);
    const overItems = getContainerItems(overContainer, tierData, unassigned);

    const movedItem = activeItems.find((song) => song.id === active.id);
    if (!movedItem) return;

    // Appended rather than inserted at the pointer: applyContainers sorts the
    // container by title, so the tile previews at its final alphabetical slot.
    const { newTiers, newUnassigned } = applyContainers(tierData, unassigned, {
      [activeContainer]: activeItems.filter((song) => song.id !== active.id),
      [overContainer]: [...overItems, movedItem]
    });

    recentlyMovedToNewContainer.current = true;
    movedAcrossContainers.current = true;
    setDraftPreview(newTiers, newUnassigned);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);

    const {
      editorTierData: tierData,
      unassignedSongs: unassigned,
      updateDraftState
    } = useAdminTierStore.getState();

    const droppedOutside = isDropOutsideEveryContainer({
      hasOverTarget: Boolean(over),
      lastTargetWasSubstitute: lastTargetWasSubstitute.current
    });
    const activeContainer = droppedOutside ? null : findContainer(active.id, tierData, unassigned);
    const overContainer = droppedOutside ? null : findContainer(over.id, tierData, unassigned);

    if (!activeContainer || !overContainer) {
      // Dropped outside any container: undo the preview moves, keep prior state.
      if (movedAcrossContainers.current) restoreSnapshot();
      cleanupDragRefs();
      return;
    }

    // onDragOver already placed the song in its container in sorted position,
    // so a same-container drop changes nothing and must not dirty the draft.
    if (movedAcrossContainers.current) {
      updateDraftState(tierData, unassigned);
    }
    cleanupDragRefs();
  };

  const handleDragCancel = () => {
    restoreSnapshot();
    setActiveId(null);
    cleanupDragRefs();
  };

  return {
    activeId,
    sensors,
    collisionDetectionStrategy,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel
  };
};

export default useAdminTierDnd;
