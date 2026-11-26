"use client";

import { useEffect, useRef, useState } from "react";
import { getProjectTags, setProjectTags, updateProject } from "../../lib/api-client";
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { DEFAULT_LICENSE, asLicense, type ProjectLicense } from "../../lib/license";
import { useT } from "../../context/i18n-context";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { LicensePicker } from "./license-picker";
import { MAX_TAGS, TagEditor, cleanTag } from "./tag-editor";

export function LicenseCard({
  projectId,
  license,
  disabled,
  onSaved,
}: {
  projectId: string;
  license: string | null;
  disabled: boolean;
  onSaved: (next: ProjectLicense) => void;
}) {
  const t = useT();
  const current = asLicense(license);
  const [choice, setChoice] = useState<ProjectLicense>(current ?? DEFAULT_LICENSE);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ErrorSource | null>(null);
  const dirty = choice !== current;

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateProject(projectId, { license: choice });
      onSaved(choice);
      setSaved(true);
    } catch (err) {
      setError(errorSource(err, "lic.saveFail"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-foreground">{t("lic.title")}</h2>
      <p className="mb-4 text-sm text-muted">{current ? t("lic.lead") : t("lic.leadMissing")}</p>
      <LicensePicker
        value={choice}
        onChange={(next) => {
          setChoice(next);
          setSaved(false);
        }}
        disabled={disabled || saving}
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {renderError(error)}
        </p>
      )}
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => void save()} disabled={disabled || saving || (!dirty && current !== null)}>
          {saving ? t("pset.saving") : t("lic.save")}
        </Button>
        {saved && (
          <span role="status" className="text-sm text-success-foreground">
            {t("lic.saved")}
          </span>
        )}
      </div>
    </Card>
  );
}

export function TagsCard({
  projectId,
  disabled,
  externalTag,
  onTagsChanged,
}: {
  projectId: string;
  disabled: boolean;
  externalTag?: { tag: string; nonce: number } | null;
  onTagsChanged?: (tags: string[]) => void;
}) {
  const t = useT();
  const [saved, setSavedTags] = useState<string[] | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<ErrorSource | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<ErrorSource | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getProjectTags(projectId)
      .then((list) => {
        if (cancelled) return;
        setLoadError(null);
        setSavedTags(list);
        setTags(list);
        onTagsChanged?.(list);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorSource(err, "tag.loadFail"));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey, onTagsChanged]);

  const tagsRef = useRef(tags);
  useEffect(() => {
    tagsRef.current = tags;
  }, [tags]);
  const appliedNonceRef = useRef(0);

  useEffect(() => {
    if (
      externalTag &&
      externalTag.nonce > 0 &&
      externalTag.nonce !== appliedNonceRef.current &&
      saved !== null
    ) {
      appliedNonceRef.current = externalTag.nonce;
      const cleaned = cleanTag(externalTag.tag);
      const current = tagsRef.current;
      if (cleaned && !current.includes(cleaned) && current.length < MAX_TAGS) {
        const next = [...current, cleaned];
        setTags(next);
        setDone(false);
        onTagsChanged?.(next);
      }
    }
  }, [externalTag, saved, onTagsChanged]);

  const dirty = saved !== null && (tags.length !== saved.length || tags.some((tag, i) => tag !== saved[i]));

  async function save() {
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      const result = await setProjectTags(projectId, tags);
      setSavedTags(result);
      setTags(result);
      onTagsChanged?.(result);
      setDone(true);
    } catch (err) {
      setError(errorSource(err, "tag.saveFail"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-semibold text-foreground">{t("tag.title")}</h2>
      <p className="mb-4 text-sm text-muted">{t("tag.lead")}</p>
      {loadError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">
          <span>{renderError(loadError)}</span>
          <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
            {t("ui.retry")}
          </Button>
        </div>
      ) : saved === null ? (
        <p role="status" className="text-sm text-muted">
          {t("ui.loading")}
        </p>
      ) : (
        <>
          <TagEditor
            tags={tags}
            onChange={(next) => {
              setTags(next);
              onTagsChanged?.(next);
              setDone(false);
            }}
            disabled={disabled || saving}
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {renderError(error)}
            </p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={() => void save()} disabled={disabled || saving || !dirty}>
              {saving ? t("pset.saving") : t("tag.save")}
            </Button>
            {done && (
              <span role="status" className="text-sm text-success-foreground">
                {t("tag.saved")}
              </span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
