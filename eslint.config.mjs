import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The Next 16 default flags every `setState` inside `useEffect` —
      // including the legitimate "hydrate from localStorage on mount"
      // pattern which every page in this app uses. The rule's recommended
      // replacement (useSyncExternalStore) makes sense when we move from
      // localStorage → Firestore; until then, this rule blocks builds for
      // the wrong reason. Off until the migration.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
