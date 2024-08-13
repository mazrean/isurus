import fs from "fs";
import packageJson from "../package.json";

const properties = packageJson.contributes.configuration.properties;

fs.writeFileSync(
  `src/config.gen.ts`,
  `/**
* @generated
*/

export const config = ${JSON.stringify(properties, null, 2)} as const;
`
);
