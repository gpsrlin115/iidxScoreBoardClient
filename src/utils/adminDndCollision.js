/**
 * Turns a raw collision result into the drop target for the admin tier editor.
 *
 * `isRealCollision` matters as much as the id. The frame right after a
 * container switch has no collision to report, but returning nothing would let
 * the previewed tile snap back, so the active item stands in for one frame.
 * That substitute must never be mistaken for a drop target: dnd-kit's
 * PointerSensor does not recompute collisions on pointerup, so releasing inside
 * that frame would otherwise commit the move to the tier the pointer had
 * already left.
 */
export const resolveDropTarget = ({
  collisionId,
  activeId,
  recentlyMovedToNewContainer,
}) => {
  if (collisionId != null) {
    return { id: collisionId, isRealCollision: true };
  }
  if (recentlyMovedToNewContainer) {
    return { id: activeId, isRealCollision: false };
  }
  return { id: null, isRealCollision: false };
};

/**
 * Whether a drop landed outside every container and must restore the pre-drag
 * state. A substitute target counts as outside even though dnd-kit reports a
 * non-null `over` for it.
 */
export const isDropOutsideEveryContainer = ({
  hasOverTarget,
  lastTargetWasSubstitute,
}) => !hasOverTarget || lastTargetWasSubstitute;
