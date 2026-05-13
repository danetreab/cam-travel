import "react-i18next"
import en from "./locales/en.json"
import km from "./locales/km.json"

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "en"
    resources: {
      en: typeof en
      km: typeof km
    }
  }
}
