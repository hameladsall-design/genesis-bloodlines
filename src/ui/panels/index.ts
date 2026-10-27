/**
 * Panel registry.
 *
 * Importing this module registers every panel. The interface shell reads the
 * registry to build the launcher bar.
 */

import './roster';
import './social';
import './settlement';
import './battle';
import './world';

export { panelRegistry, getPanel, sortedPanels, registerPanel } from './types';
export type { PanelDef, PanelContext } from './types';
