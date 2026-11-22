"use client";

import { PageHeader } from "../../components/ui/page-header";
import { useI18n } from "../../context/i18n-context";
import { TERMS_CONTENT } from "../../lib/terms-content";

export default function TermsPage() {
  const { lang, t } = useI18n();
  const doc = TERMS_CONTENT[lang];

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8">
      <PageHeader title={doc.title} description={doc.updated} breadcrumbs={[{ label: t("terms.pageCrumb") }]} />
      <p className="mb-8 text-sm leading-relaxed">{doc.intro}</p>
      <div className="flex flex-col gap-7">
        {doc.sections.map((section) => (
          <section key={section.heading} aria-labelledby={`terms-${section.heading.split(".")[0]}`}>
            <h2 id={`terms-${section.heading.split(".")[0]}`} className="text-section mb-2">
              {section.heading}
            </h2>
            <div className="flex flex-col gap-2.5 text-sm leading-relaxed text-muted">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
