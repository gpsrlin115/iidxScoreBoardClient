import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isDropOutsideEveryContainer,
  resolveDropTarget,
} from '../src/utils/adminDndCollision.js';

test('a real collision is the drop target', () => {
  assert.deepEqual(resolveDropTarget({
    collisionId: '地力|S',
    activeId: 'Alpha__ANOTHER',
    recentlyMovedToNewContainer: false,
  }), { id: '地力|S', isRealCollision: true });
});

test('the active item stands in during the post-switch grace frame, but not as a real collision', () => {
  assert.deepEqual(resolveDropTarget({
    collisionId: null,
    activeId: 'Alpha__ANOTHER',
    recentlyMovedToNewContainer: true,
  }), { id: 'Alpha__ANOTHER', isRealCollision: false });
});

test('no drop target once the pointer leaves every container', () => {
  // Regression guard. This used to fall back to the previously hovered target,
  // which kept `over` non-null and made an out-of-bounds drop commit to the
  // last tier the pointer passed over instead of cancelling.
  assert.deepEqual(resolveDropTarget({
    collisionId: null,
    activeId: 'Alpha__ANOTHER',
    recentlyMovedToNewContainer: false,
  }), { id: null, isRealCollision: false });
});

test('a real collision is a genuine drop', () => {
  assert.equal(isDropOutsideEveryContainer({
    hasOverTarget: true,
    lastTargetWasSubstitute: false,
  }), false);
});

test('releasing on the grace-frame stand-in counts as outside every container', () => {
  // Regression guard. dnd-kit's PointerSensor reuses the last computed `over`
  // on pointerup instead of recomputing, so releasing inside the grace frame
  // reported a non-null target and committed the move to the tier the pointer
  // had already left.
  assert.equal(isDropOutsideEveryContainer({
    hasOverTarget: true,
    lastTargetWasSubstitute: true,
  }), true);
});

test('no target at all counts as outside every container', () => {
  assert.equal(isDropOutsideEveryContainer({
    hasOverTarget: false,
    lastTargetWasSubstitute: false,
  }), true);
});
