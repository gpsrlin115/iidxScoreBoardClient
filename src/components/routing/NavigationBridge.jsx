import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setNavigator } from '../../utils/navigation';

/**
 * Registers react-router's `useNavigate()` with the navigation bridge
 * (`src/utils/navigation.js`) so code outside the render tree — namely the
 * axios response interceptor — can trigger SPA navigation (e.g. on 401).
 *
 * Renders nothing. Must be mounted inside <Router>.
 */
function NavigationBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    setNavigator(navigate);
    return () => setNavigator(null);
  }, [navigate]);

  return null;
}

export default NavigationBridge;
