import { CalloutFormSchema } from "@beabee/beabee-common";

import { CalloutAccess } from "@enums/callout-access";

export interface CalloutData {
  slug?: string;
  title: string;
  excerpt: string;
  image: string;
  starts: Date | null;
  expires: Date | null;
  allowUpdate: boolean;
  allowMultiple: boolean;
  access: CalloutAccess;
  hidden: boolean;

  // With "form"
  intro?: string;
  thanksTitle?: string;
  thanksText?: string;
  thanksRedirect?: string;
  shareTitle?: string;
  shareDescription?: string;
  formSchema?: CalloutFormSchema;
}
