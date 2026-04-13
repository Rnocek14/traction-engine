import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIngestViralVideo } from "@/hooks/use-viral-videos";
import { Loader2, Video, ChevronDown } from "lucide-react";

export function ViralIntakeForm() {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");
  const [commentsCount, setCommentsCount] = useState("");
  const [creatorHandle, setCreatorHandle] = useState("");
  const [showOptional, setShowOptional] = useState(false);

  const ingest = useIngestViralVideo();

  const handleSubmit = () => {
    if (!url.trim()) return;
    ingest.mutate({
      url: url.trim(),
      caption: caption.trim() || undefined,
      views: views ? parseInt(views) : undefined,
      likes: likes ? parseInt(likes) : undefined,
      comments_count: commentsCount ? parseInt(commentsCount) : undefined,
      creator_handle: creatorHandle.trim() || undefined,
    }, {
      onSuccess: () => {
        setUrl("");
        setCaption("");
        setViews("");
        setLikes("");
        setCommentsCount("");
        setCreatorHandle("");
      },
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="w-4 h-4 text-primary" />
          Viral Video Intake
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Paste TikTok / IG Reel / YouTube Short URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          <Button onClick={handleSubmit} disabled={!url.trim() || ingest.isPending} className="shrink-0">
            {ingest.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ingest"}
          </Button>
        </div>

        <Collapsible open={showOptional} onOpenChange={setShowOptional}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground h-7">
              <ChevronDown className={`w-3 h-3 transition-transform ${showOptional ? "rotate-180" : ""}`} />
              Optional details
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-2">
            <Textarea
              placeholder="Caption / description from the video..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="min-h-[60px]"
            />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Views" type="number" value={views} onChange={(e) => setViews(e.target.value)} />
              <Input placeholder="Likes" type="number" value={likes} onChange={(e) => setLikes(e.target.value)} />
              <Input placeholder="Comments" type="number" value={commentsCount} onChange={(e) => setCommentsCount(e.target.value)} />
            </div>
            <Input placeholder="@creator_handle" value={creatorHandle} onChange={(e) => setCreatorHandle(e.target.value)} />
          </CollapsibleContent>
        </Collapsible>

        <p className="text-xs text-muted-foreground">
          Paste a viral video URL → AI extracts the product → triggers research pipeline automatically.
        </p>
      </CardContent>
    </Card>
  );
}
