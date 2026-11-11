"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import type { JamEvent } from "@stave/shared-types";
import { getJamEvent } from "../../../lib/api-jam";
import { errorSource, renderError, type ErrorSource } from "../../../lib/error-message";
import { useAuth } from "../../../context/auth-context";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import { JamSession } from "../../../components/jam/jam-session";
import { useI18n } from "../../../context/i18n-context";

function JamRoomContent({ id }: { id: string }) {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const router = useRouter();

  const [event, setEvent] = useState<JamEvent | null>(null);
  const [error, setError] = useState<ErrorSource | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?redirect=${encodeURIComponent(`/jam/${id}`)}`);
    }
  }, [loading, user, router, id]);

  useEffect(() => {
    let cancelled = false;
    if (loading || !user) return;

    async function load() {
      try {
        const data = await getJamEvent(id);
        if (cancelled) return;
        setEvent(data);
      } catch (err) {
        if (cancelled) return;
        setError(errorSource(err, "jam.eventLoadFail"));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, user, loading, refreshKey]);


  if (loading || !user) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
        {t("ui.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8">
        <EmptyState
          icon={TriangleAlert}
          title={t("jam.eventFailTitle")}
          description={renderError(error) ?? undefined}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setEvent(null);
                setError(null);
                setRefreshKey((n) => n + 1);
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> {t("ui.retry")}
            </Button>
          }
        />
      </Card>
    );
  }

  if (!event) {
    return (
      <Card className="flex min-h-[240px] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          {t("jam.eventLoading")}
        </div>
      </Card>
    );
  }

  return <JamSession event={event} />;
}

interface Props {
  params: Promise<{ id: string }>;
}

export default function JamRoomPage({ params }: Props) {
  const { id } = use(params);
  return (
    <div className="mx-auto min-h-full w-full max-w-page px-5 py-8">
      <JamRoomContent id={id} />
    </div>
  );
}
