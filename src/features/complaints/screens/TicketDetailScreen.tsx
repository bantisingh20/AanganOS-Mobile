import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormScreen } from '@/components/ui/FormScreen';
import { parseUtc } from '@/utils/datetime';
import { AppTextField } from '@/components/ui/AppTextField';
import { AppButton } from '@/components/ui/AppButton';
import { AsyncBoundary } from '@/components/ui/AsyncBoundary';
import { Badge } from '@/components/ui/Badge';
import { FormBanner } from '@/components/ui/FormBanner';
import { useAsync, useAsyncAction } from '@/hooks';
import { theme } from '@/theme';
import { TicketStatus } from '@/types/helpdesk';
import type { Ticket, TicketAttachment, TicketComment } from '@/types/helpdesk';
import type { ResourceClients } from '@/services/resources';
import { ticketStatusTone, humanizeCode } from '@/utils/status';

export interface TicketDetailScreenProps {
  resources: ResourceClients;
  ticketId: string;
  /** The row the resident tapped, shown immediately while the fresh copy loads. */
  initialTicket?: Ticket;
  onBack?: () => void;
}

const RATING_CHOICES = [1, 2, 3, 4, 5] as const;

/**
 * Resident ticket detail (Req 34.1, 34.4) — a modern, hierarchical layout: a status hero card
 * (title + category/priority chips + status badge), the description, a timeline (raised → assigned →
 * target), attachment thumbnails (rendered via the authorized File_Service download), and a feedback
 * section (star rating + optional comment) once the ticket is resolved/closed. The ticket re-fetches
 * so the status is current even if it moved since the list loaded.
 */
export function TicketDetailScreen({ resources, ticketId, initialTicket, onBack }: TicketDetailScreenProps) {
  const { data, loading, error, reload } = useAsync<Ticket>(
    (signal) => resources.helpdesk.getTicket(ticketId, { signal }),
    [ticketId],
  );
  const attachmentsState = useAsync<TicketAttachment[]>(
    (signal) => resources.helpdesk.getAttachments(ticketId, { signal }),
    [ticketId],
  );
  const commentsState = useAsync<TicketComment[]>(
    (signal) => resources.helpdesk.getComments(ticketId, { signal }),
    [ticketId],
  );

  const ticket = data ?? initialTicket ?? null;
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [newComment, setNewComment] = useState('');

  const postComment = useAsyncAction(() => {
    const text = newComment.trim();
    if (!text) return Promise.reject(new Error('Enter a comment'));
    return resources.helpdesk.addComment(ticketId, text).then((c) => {
      setNewComment('');
      commentsState.reload();
      return c;
    });
  });

  const submit = useAsyncAction(() => {
    if (rating === null) return Promise.reject(new Error('Select a rating'));
    return resources.helpdesk
      .submitFeedback(ticketId, { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) })
      .then((t) => { reload(); return t; });
  });

  const attachments = attachmentsState.data ?? [];
  const tone = ticket ? ticketStatusTone(ticket.status) : 'neutral';

  return (
    <FormScreen title="Ticket" {...(onBack ? { onBack } : {})}>
      <AsyncBoundary
        loading={loading && !ticket}
        error={ticket ? null : error}
        empty={!loading && !ticket}
        emptyMessage="This ticket could not be loaded."
        onRetry={reload}
      >
        {ticket ? (
          <>
            {/* Status hero — a bold status-tinted header card (reference "Complaint info"). */}
            <View style={[styles.hero, { backgroundColor: toneColor(tone) }]}>
              <View style={styles.heroBlobA} />
              <View style={styles.heroBlobB} />

              <View style={styles.heroTop}>
                <View style={styles.heroCat}>
                  <Ionicons name="construct" size={16} color="#fff" />
                  <Text style={styles.heroCatText} numberOfLines={1}>{humanizeCode(ticket.category)}</Text>
                </View>
                <View style={styles.heroStatusPill}>
                  <Text style={styles.heroStatusText}>{humanizeCode(ticket.status).toUpperCase()}</Text>
                </View>
              </View>

              <Text style={styles.heroTitle} numberOfLines={3}>{ticket.title}</Text>

              <View style={styles.heroMetaRow}>
                <View style={styles.heroMeta}>
                  <Ionicons name="flag" size={13} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.heroMetaText}>{humanizeCode(ticket.priority)}</Text>
                </View>
                <View style={styles.heroMetaDot} />
                <View style={styles.heroMeta}>
                  <Ionicons name="time" size={13} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.heroMetaText}>Raised {formatDateTime(ticket.createdAtUtc)}</Text>
                </View>
              </View>
            </View>

            {/* Description */}
            <Section title="Description" icon="document-text-outline">
              <Text style={styles.body}>{ticket.description}</Text>
            </Section>

            {/* Timeline */}
            <Section title="Timeline" icon="time-outline">
              <TimelineRow icon="create-outline" label="Raised" value={formatDateTime(ticket.createdAtUtc)} done />
              <TimelineRow icon="person-outline" label="Assigned" value={ticket.assignedAtUtc ? formatDateTime(ticket.assignedAtUtc) : 'Not yet assigned'} done={Boolean(ticket.assignedAtUtc)} />
              {ticket.slaDueAtUtc ? (
                <TimelineRow icon="alarm-outline" label="Target resolution" value={formatDateTime(ticket.slaDueAtUtc)} done={ticket.status === TicketStatus.Resolved || ticket.status === TicketStatus.Closed} last />
              ) : null}
            </Section>

            {/* Attachments */}
            <Section title="Attachments" icon="images-outline">
              <AsyncBoundary
                loading={attachmentsState.loading}
                error={attachmentsState.error}
                empty={!attachmentsState.loading && attachments.length === 0}
                emptyMessage="No photos attached to this ticket."
                onRetry={attachmentsState.reload}
              >
                <View style={styles.thumbRow}>
                  {attachments.map((a) => {
                    const src = resources.files.downloadSource(a.fileId);
                    return src ? (
                      <Image key={a.id} source={src} style={styles.thumb} accessibilityLabel="Ticket attachment" />
                    ) : (
                      <View key={a.id} style={[styles.thumb, styles.thumbEmpty]}>
                        <Ionicons name="document-outline" size={22} color={theme.color.mutedText} />
                      </View>
                    );
                  })}
                </View>
              </AsyncBoundary>
            </Section>

            {/* Comments — the discussion thread + a write box (reference "Recent comments"). */}
            <Section title="Comments" icon="chatbubbles-outline">
              <AsyncBoundary
                loading={commentsState.loading}
                error={commentsState.error}
                empty={!commentsState.loading && (commentsState.data ?? []).length === 0}
                emptyMessage="No comments yet. Start the conversation below."
                onRetry={commentsState.reload}
              >
                <View style={styles.commentList}>
                  {(commentsState.data ?? []).map((c) => (
                    <View key={c.id} style={styles.commentRow}>
                      <View style={styles.commentAvatar}>
                        <Ionicons name="person" size={14} color={theme.color.primary} />
                      </View>
                      <View style={styles.commentBubble}>
                        <Text style={styles.commentBody}>{c.body}</Text>
                        <Text style={styles.commentTime}>{formatDateTime(c.createdAtUtc)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </AsyncBoundary>

              {/* Write box */}
              <View style={styles.commentCompose}>
                <AppTextField
                  label="Add a comment"
                  value={newComment}
                  onChangeText={setNewComment}
                  placeholder="Write a comment…"
                  autoCapitalize="sentences"
                  multiline
                  numberOfLines={2}
                  {...(postComment.error?.fieldErrors.body ? { error: postComment.error.fieldErrors.body } : {})}
                />
                {postComment.error && !postComment.error.fieldErrors.body ? (
                  <FormBanner message={postComment.error.message} tone="error" />
                ) : null}
                <Pressable
                  onPress={() => postComment.run()}
                  disabled={newComment.trim().length === 0 || postComment.running}
                  accessibilityRole="button"
                  accessibilityLabel="Post comment"
                  style={({ pressed }) => [
                    styles.commentPost,
                    (newComment.trim().length === 0 || postComment.running) ? styles.commentPostDisabled : null,
                    pressed ? { opacity: 0.9 } : null,
                  ]}
                >
                  <Ionicons name={postComment.running ? 'hourglass' : 'send'} size={16} color="#fff" />
                  <Text style={styles.commentPostText}>{postComment.running ? 'Posting…' : 'Post'}</Text>
                </Pressable>
              </View>
            </Section>

            {/* Feedback */}
            <Section title="Feedback" icon="star-outline">
              {ticket.feedbackAtUtc && ticket.rating !== null ? (
                <View style={styles.feedbackGiven}>
                  <View style={styles.starsRow}>
                    {RATING_CHOICES.map((n) => (
                      <Ionicons key={n} name={n <= ticket.rating! ? 'star' : 'star-outline'} size={22} color={theme.color.warning} />
                    ))}
                  </View>
                  <Text style={styles.body}>{ticket.feedbackComment ?? 'No comment'}</Text>
                  <Badge label="Submitted" tone="positive" />
                </View>
              ) : isFeedbackEligible(ticket.status) ? (
                <>
                  <Text style={styles.feedbackPrompt}>How did we do? Tap a star to rate.</Text>
                  <View style={styles.starsRow} accessibilityRole="radiogroup" accessibilityLabel="Satisfaction rating">
                    {RATING_CHOICES.map((n) => (
                      <Pressable
                        key={n}
                        onPress={() => setRating(n)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: rating === n }}
                        accessibilityLabel={`Rate ${n} out of 5`}
                        hitSlop={6}
                      >
                        <Ionicons name={rating !== null && n <= rating ? 'star' : 'star-outline'} size={32} color={theme.color.warning} />
                      </Pressable>
                    ))}
                  </View>
                  <AppTextField
                    label="Comment (optional)"
                    value={comment}
                    onChangeText={setComment}
                    placeholder="Tell us how it went"
                    autoCapitalize="sentences"
                    multiline
                    numberOfLines={3}
                    {...(submit.error?.fieldErrors.comment ? { error: submit.error.fieldErrors.comment } : {})}
                  />
                  {submit.error && !submit.error.fieldErrors.comment ? (
                    <FormBanner message={submit.error.message} tone="error" />
                  ) : null}
                  <AppButton
                    title="Submit feedback"
                    loading={submit.running}
                    disabled={rating === null}
                    onPress={() => submit.run()}
                    accessibilityHint="Submit your feedback rating for this ticket"
                  />
                </>
              ) : (
                <Text style={styles.body}>You can leave feedback once this ticket is resolved.</Text>
              )}
            </Section>
          </>
        ) : null}
      </AsyncBoundary>
    </FormScreen>
  );
}

/** A titled section card. */
function Section({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={16} color={theme.color.mutedText} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

/** A step in the timeline: a colored dot + label + value. */
function TimelineRow({ icon, label, value, done, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; done: boolean; last?: boolean }) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        <View style={[styles.timelineDot, { backgroundColor: done ? theme.color.success : theme.color.disabled }]}>
          <Ionicons name={icon} size={12} color={theme.color.primaryText} />
        </View>
        {!last ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={styles.timelineText}>
        <Text style={styles.timelineLabel}>{label}</Text>
        <Text style={styles.timelineValue}>{value}</Text>
      </View>
    </View>
  );
}

function isFeedbackEligible(status: string): boolean {
  return status === TicketStatus.Resolved || status === TicketStatus.Closed;
}

function toneColor(tone: ReturnType<typeof ticketStatusTone>): string {
  switch (tone) {
    case 'positive': return theme.color.success;
    case 'warning': return theme.color.warning;
    case 'danger': return theme.color.danger;
    default: return theme.color.primary;
  }
}

function formatDateTime(iso: string): string {
  const d = parseUtc(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const styles = StyleSheet.create({
  // Status hero — bold tinted header card.
  hero: {
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    overflow: 'hidden',
    ...theme.shadow.hero,
  },
  heroBlobA: { position: 'absolute', top: -50, right: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.14)' },
  heroBlobB: { position: 'absolute', bottom: -60, left: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(0,0,0,0.08)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  heroCat: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: theme.radius.pill,
    paddingVertical: 5, paddingHorizontal: theme.spacing.md,
  },
  heroCatText: { color: '#fff', fontSize: theme.fontSize.caption, fontWeight: '700', flexShrink: 1 },
  heroStatusPill: { backgroundColor: '#fff', borderRadius: theme.radius.pill, paddingVertical: 5, paddingHorizontal: theme.spacing.md },
  heroStatusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6, color: theme.color.text },
  heroTitle: { fontSize: theme.fontSize.heading, fontWeight: '800', color: '#fff', lineHeight: 30 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroMetaText: { color: 'rgba(255,255,255,0.9)', fontSize: theme.fontSize.caption, fontWeight: '600' },
  heroMetaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.5)' },

  // Section cards.
  section: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    ...theme.shadow.soft,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  sectionTitle: { fontSize: theme.fontSize.caption, fontWeight: '800', color: theme.color.mutedText, letterSpacing: 0.5, textTransform: 'uppercase' },
  body: { fontSize: theme.fontSize.body, color: theme.color.text, lineHeight: 22 },

  // Timeline.
  timelineRow: { flexDirection: 'row', gap: theme.spacing.md },
  timelineRail: { alignItems: 'center', width: 24 },
  timelineDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  timelineLine: { width: 2, flex: 1, backgroundColor: theme.color.border, marginVertical: 2 },
  timelineText: { flex: 1, paddingBottom: theme.spacing.sm },
  timelineLabel: { fontSize: theme.fontSize.label, fontWeight: '700', color: theme.color.text },
  timelineValue: { fontSize: theme.fontSize.caption, color: theme.color.mutedText, marginTop: 1 },

  // Attachments.
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  thumb: { width: 84, height: 84, borderRadius: theme.radius.md, backgroundColor: theme.color.background },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.color.border },

  // Feedback.
  feedbackPrompt: { fontSize: theme.fontSize.label, color: theme.color.mutedText },
  starsRow: { flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'center' },
  feedbackGiven: { gap: theme.spacing.sm },

  // Comments.
  commentList: { gap: theme.spacing.md },
  commentRow: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' },
  commentAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: `${theme.color.primary}1a`, alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  commentBubble: {
    flex: 1, backgroundColor: theme.color.background, borderRadius: theme.radius.md,
    padding: theme.spacing.md, gap: 4,
  },
  commentBody: { fontSize: theme.fontSize.label, color: theme.color.text, lineHeight: 20 },
  commentTime: { fontSize: theme.fontSize.caption, color: theme.color.mutedText },
  commentCompose: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  commentPost: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    alignSelf: 'flex-end',
    backgroundColor: theme.color.primary, borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.xl,
  },
  commentPostDisabled: { backgroundColor: theme.color.disabled },
  commentPostText: { color: '#fff', fontSize: theme.fontSize.label, fontWeight: '800' },
});
