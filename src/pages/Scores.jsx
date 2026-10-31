import { SCORE_BROWSER_V2_ENABLED } from '../constants/scoreBrowser';
import LegacyScores from './LegacyScores';
import ScoreBrowser from './ScoreBrowser';

export default SCORE_BROWSER_V2_ENABLED ? ScoreBrowser : LegacyScores;
