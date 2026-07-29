/**
 * `/ddr` — standalone placeholder route, no header/auth (sits outside ProtectedLayout).
 * Shows a single image full-bleed; nothing else is rendered on this route.
 */
const Ddr = () => (
  <div className="min-h-screen bg-black flex items-center justify-center px-4">
    <img
      src="/ddr-coming-soon.png"
      alt="DDR Coming Soon"
      className="max-w-full max-h-screen object-contain"
    />
  </div>
);

export default Ddr;
