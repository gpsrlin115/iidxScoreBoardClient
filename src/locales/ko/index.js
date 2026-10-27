import auth from './auth.json' with { type: 'json' };
import common from './common.json' with { type: 'json' };
import errors from './errors.json' with { type: 'json' };
import layout from './layout.json' with { type: 'json' };

// One JSON file per feature; the file name becomes the first key segment, so
// keys read `feature.area.item` (for example `auth.login.submit`). The import
// attributes keep these modules loadable by node:test as well as by Vite.
export default { auth, common, errors, layout };
