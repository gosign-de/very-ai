"use client";

import { FC } from "react";
import { IconExternalLink, IconSearch } from "@tabler/icons-react";

interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
    domain: string;
  };
  maps?: {
    uri: string;
    title: string;
    placeId?: string;
  };
}

interface GroundingSupport {
  segment: {
    startIndex?: number;
    endIndex?: number;
    text: string;
  };
  groundingChunkIndices: number[];
}

interface GroundingMetadata {
  webSearchQueries?: string[];
  searchEntryPoint?: {
    renderedContent: string;
  };
  groundingChunks?: GroundingChunk[];
  groundingSupports?: GroundingSupport[];
  retrievalMetadata?: any;
}

interface GroundingDisplayProps {
  groundingMetadata: GroundingMetadata;
}

export const GroundingDisplay: FC<GroundingDisplayProps> = ({
  groundingMetadata,
}) => {
  if (!groundingMetadata) {
    return null;
  }

  const { groundingChunks, webSearchQueries, searchEntryPoint } =
    groundingMetadata;

  // Filter out unique web domains
  const uniqueWebSources = groundingChunks
    ? groundingChunks
        .filter(
          (chunk): chunk is { web: NonNullable<GroundingChunk["web"]> } =>
            chunk.web !== undefined,
        )
        .reduce(
          (acc, chunk) => {
            const domain = chunk.web.domain;
            if (!acc.find(item => item.domain === domain)) {
              acc.push(chunk.web);
            }
            return acc;
          },
          [] as Array<NonNullable<GroundingChunk["web"]>>,
        )
    : [];

  // Get map locations
  const mapSources = groundingChunks
    ? groundingChunks
        .filter(
          (chunk): chunk is { maps: NonNullable<GroundingChunk["maps"]> } =>
            chunk.maps !== undefined,
        )
        .map(chunk => chunk.maps)
    : [];

  if (
    uniqueWebSources.length === 0 &&
    mapSources.length === 0 &&
    !searchEntryPoint
  ) {
    return null;
  }

  return (
    <div className="border-border bg-card mt-4 rounded-lg border p-3">
      {/* {searchEntryPoint && searchEntryPoint.renderedContent && (
        <div
          className="mb-4"
          dangerouslySetInnerHTML={{ __html: searchEntryPoint.renderedContent }}
        />
      )} */}

      {mapSources.length > 0 && (
        <div className="mb-4">
          <div className="text-muted-foreground mb-2 text-xs font-medium">
            Locations
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {mapSources.map((source, index) => {
              const cidMatch = source.uri.match(/cid=(\d+)/);
              const embedUrl = cidMatch
                ? `https://maps.google.com/maps?cid=${cidMatch[1]}&output=embed`
                : null;

              return (
                <div
                  key={index}
                  className="bg-card overflow-hidden rounded-md border"
                >
                  {embedUrl && (
                    <div className="aspect-video w-full">
                      <iframe
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        style={{ border: 0 }}
                        src={embedUrl}
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between p-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium leading-none">
                        {source.title}
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        Google Maps
                      </span>
                    </div>
                    <a
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
                      title="Open in Google Maps"
                    >
                      <IconExternalLink size={16} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {uniqueWebSources.length > 0 && (
        <>
          <div className="text-muted-foreground mb-2 text-xs font-medium">
            Web Sources
          </div>

          {webSearchQueries && webSearchQueries.length > 0 && (
            <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs">
              <IconSearch size={12} className="shrink-0" />
              <span>{webSearchQueries.join(", ")}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {uniqueWebSources.map((source, index) => (
              <a
                key={index}
                href={source.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-muted text-foreground hover:bg-accent flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
              >
                <span className="max-w-[200px] truncate">{source.domain}</span>
                <IconExternalLink size={12} />
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
