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
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import useAdminTierStore from '../store/adminTierStore';

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

const applyContainers = (tierData, unassigned, changes) => {
  const newTiers = { ...tierData };
  let newUnassigned = unassigned;
  for (const [container, items] of Object.entries(changes)) {
    if (container === UNASSIGNED_ID) newUnassigned = items;
    else newTiers[container] = items;
  }
  return { newTiers, newUnassigned };
};

/**
 * useAdminTierDnd
 * Drag-and-drop handlers for the admin tier editor, ported from dnd-kit's
 * official MultipleContainers pattern. Items are moved into the hovered
 * container during onDragOver so the insertion gap is previewed in real time;
 * onDragEnd only finalizes ordering and marks the draft as changed.
 */
const useAdminTierDnd = () => {
  const [activeId, setActiveId] = useState(null);

  // Pre-drag snapshot used to restore state on cancel / invalid drop.
  const snapshotRef = useRef(null);
  // True once the active item changed containers during this drag.
  const movedAcrossContainers = useRef(false);
  // Guards against collision-detection flicker right after a container switch.
  const recentlyMovedToNewContainer = useRef(false);
  const lastOverId = useRef(null);

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
      lastOverId.current = overId;
      return [{ id: overId }];
    }

    // After a container switch the layout shifts under the pointer; reuse the
    // active id for one frame so the item does not snap back.
    if (recentlyMovedToNewContainer.current) {
      lastOverId.current = args.active.id;
    }
    return lastOverId.current ? [{ id: lastOverId.current }] : [];
  }, []);

  const cleanupDragRefs = () => {
    snapshotRef.current = null;
    movedAcrossContainers.current = false;
    lastOverId.current = null;
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

    const activeIndex = activeItems.findIndex((song) => song.id === active.id);
    if (activeIndex === -1) return;

    const overIndex = overItems.findIndex((song) => song.id === overId);
    let newIndex;
    if (overIndex === -1) {
      newIndex = overItems.length;
    } else {
      // Tiles flow left-to-right in a wrapped row, so compare horizontal centers
      // to decide whether to insert before or after the hovered tile.
      const translated = active.rect.current.translated;
      const isAfterOverItem =
        translated && translated.left + translated.width / 2 > over.rect.left + over.rect.width / 2;
      newIndex = overIndex + (isAfterOverItem ? 1 : 0);
    }

    const movedItem = activeItems[activeIndex];
    const { newTiers, newUnassigned } = applyContainers(tierData, unassigned, {
      [activeContainer]: activeItems.filter((song) => song.id !== active.id),
      [overContainer]: [...overItems.slice(0, newIndex), movedItem, ...overItems.slice(newIndex)]
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

    const activeContainer = over ? findContainer(active.id, tierData, unassigned) : null;
    const overContainer = over ? findContainer(over.id, tierData, unassigned) : null;

    if (!activeContainer || !overContainer) {
      // Dropped outside any container: undo the preview moves, keep prior state.
      if (movedAcrossContainers.current) restoreSnapshot();
      cleanupDragRefs();
      return;
    }

    let newTiers = tierData;
    let newUnassigned = unassigned;

    if (activeContainer === overContainer) {
      const items = getContainerItems(activeContainer, tierData, unassigned);
      const oldIndex = items.findIndex((song) => song.id === active.id);
      let newIndex = items.findIndex((song) => song.id === over.id);
      if (newIndex === -1) newIndex = items.length - 1;

      if (oldIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(items, oldIndex, newIndex);
        ({ newTiers, newUnassigned } = applyContainers(tierData, unassigned, {
          [activeContainer]: reordered
        }));
      }
    }

    const reorderedHere = newTiers !== tierData || newUnassigned !== unassigned;
    if (movedAcrossContainers.current || reorderedHere) {
      updateDraftState(newTiers, newUnassigned);
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
