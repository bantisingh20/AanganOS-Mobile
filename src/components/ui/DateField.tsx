import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export interface DateFieldProps {
  label: string;
  required?: boolean;
  value?: Date | string | null;
  onChange: (date: Date | null) => void;
  minimumDate?: Date | string;
  maximumDate?: Date | string;
  placeholder?: string;
  disabled?: boolean;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEK_DAYS = [
  'Su',
  'Mo',
  'Tu',
  'We',
  'Th',
  'Fr',
  'Sa',
];

export function DateField({
  label,
  required = false,
  value,
  onChange,
  minimumDate,
  maximumDate,
  placeholder = 'Select a date',
  disabled = false,
}: DateFieldProps) {
  const [visible, setVisible] = useState(false);

  const [mode, setMode] = useState<
    'calendar' | 'monthYear'
  >('calendar');

  /*
   * Convert incoming values once per render.
   */
  const selectedDate = parseDate(value);
  const minDate = parseDate(minimumDate);
  const maxDate = parseDate(maximumDate);

  const defaultDate = selectedDate ?? new Date();

  const [displayYear, setDisplayYear] =
    useState(defaultDate.getFullYear());

  const [displayMonth, setDisplayMonth] =
    useState(defaultDate.getMonth());

  const selectedYear = selectedDate?.getFullYear();

  const [pickerYear, setPickerYear] =
    useState(defaultDate.getFullYear());



  /*
   * IMPORTANT:
   * These hooks are ALWAYS called.
   * Never put hooks inside if/else.
   */
  const calendarDays = useMemo(() => {
    return createCalendarDays(
      displayYear,
      displayMonth,
    );
  }, [displayYear, displayMonth]);

  const years = useMemo(() => {
    return createYears(
      minDate,
      maxDate,
    );
  }, [minDate, maxDate]);

  const formattedValue = selectedDate
    ? formatDisplayDate(selectedDate)
    : '';

  /*
   * Open picker.
   */
  const openPicker = () => {
    if (disabled) {
      return;
    }

    const date = selectedDate ?? new Date();

    setDisplayYear(date.getFullYear());
    setDisplayMonth(date.getMonth());
    setPickerYear(date.getFullYear());
    setMode('calendar');
    setVisible(true);
  };

  /*
   * Close picker.
   */
  const closePicker = () => {
    setVisible(false);
    setMode('calendar');
  };

  /*
   * Date validation.
   */
  const isDateAllowed = (date: Date) => {
    const current = startOfDay(date);

    if (
      minDate &&
      current < startOfDay(minDate)
    ) {
      return false;
    }

    if (
      maxDate &&
      current > startOfDay(maxDate)
    ) {
      return false;
    }

    return true;
  };

  /*
   * Select date.
   */
  const selectDate = (date: Date) => {
    if (!isDateAllowed(date)) {
      return;
    }

    onChange(date);
    closePicker();
  };

  /*
   * Previous month.
   */
  const previousMonth = () => {
    let year = displayYear;
    let month = displayMonth - 1;

    if (month < 0) {
      month = 11;
      year--;
    }

    if (
      !canNavigateToMonth(
        year,
        month,
        minDate,
        maxDate,
      )
    ) {
      return;
    }

    setDisplayYear(year);
    setDisplayMonth(month);
  };

  /*
   * Next month.
   */
  const nextMonth = () => {
    let year = displayYear;
    let month = displayMonth + 1;

    if (month > 11) {
      month = 0;
      year++;
    }

    if (
      !canNavigateToMonth(
        year,
        month,
        minDate,
        maxDate,
      )
    ) {
      return;
    }

    setDisplayYear(year);
    setDisplayMonth(month);
  };

  /*
   * Open year/month selector.
   */
  const openMonthYear = () => {
    setPickerYear(displayYear);
    setMode('monthYear');
  };

  /*
   * Select year.
   */
  const selectYear = (year: number) => {
    setPickerYear(year);
    setDisplayYear(year);
  };

  /*
   * Select month.
   */
  const selectMonth = (month: number) => {
    if (
      !canNavigateToMonth(
        pickerYear,
        month,
        minDate,
        maxDate,
      )
    ) {
      return;
    }

    setDisplayYear(pickerYear);
    setDisplayMonth(month);
    setMode('calendar');
  };

  /*
   * Today.
   */
  const today = startOfDay(new Date());

  return (
    <>
      {/* ================================================= */}
      {/* DATE FIELD                                       */}
      {/* ================================================= */}

      <View style={styles.container}>
        <Text style={styles.label}>
          {label}

          {required && (
            <Text style={styles.required}>
              {' '}*
            </Text>
          )}
        </Text>

        <Pressable
          disabled={disabled}
          onPress={openPicker}
          style={({ pressed }) => [
            styles.input,
            disabled && styles.inputDisabled,
            pressed &&
            !disabled &&
            styles.inputPressed,
          ]}
        >
          <Text
            style={[
              styles.inputText,
              !formattedValue &&
              styles.placeholder,
            ]}
          >
            {formattedValue || placeholder}
          </Text>

          <Text style={styles.calendarIcon}>
            📅
          </Text>
        </Pressable>
      </View>

      {/* ================================================= */}
      {/* MODAL                                             */}
      {/* ================================================= */}

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={closePicker}
      >
        <View style={styles.overlay}>

          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closePicker}
          />

          <View style={styles.modal}>

            {/* HEADER */}

            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerLabel}>
                  {label}
                </Text>

                <Text style={styles.headerDate}>
                  {selectedDate
                    ? formatLongDate(
                      selectedDate,
                    )
                    : 'Select a date'}
                </Text>
              </View>

              <Pressable
                onPress={closePicker}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>
                  ×
                </Text>
              </Pressable>
            </View>

            {mode === 'calendar' ? (
              <>
                {/* ===================================== */}
                {/* CALENDAR HEADER                        */}
                {/* ===================================== */}

                <View style={styles.monthHeader}>

                  <Pressable
                    onPress={previousMonth}
                    style={styles.navButton}
                  >
                    <Text style={styles.navText}>
                      ‹
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={openMonthYear}
                    style={styles.monthButton}
                  >
                    <Text style={styles.monthTitle}>
                      {MONTHS[displayMonth]}{' '}
                      {displayYear}
                    </Text>

                    <Text style={styles.arrow}>
                      ▾
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={nextMonth}
                    style={styles.navButton}
                  >
                    <Text style={styles.navText}>
                      ›
                    </Text>
                  </Pressable>

                </View>

                {/* ===================================== */}
                {/* WEEK DAYS                             */}
                {/* ===================================== */}

                <View style={styles.weekRow}>
                  {WEEK_DAYS.map(day => (
                    <Text
                      key={day}
                      style={styles.weekDay}
                    >
                      {day}
                    </Text>
                  ))}
                </View>

                {/* ===================================== */}
                {/* DAYS                                  */}
                {/* ===================================== */}

                <View style={styles.calendar}>
                  {calendarDays.map(
                    (date, index) => {
                      if (!date) {
                        return (
                          <View
                            key={`empty-${index}`}
                            style={styles.dayCell}
                          />
                        );
                      }

                      const selected =
                        selectedDate &&
                        isSameDay(
                          date,
                          selectedDate,
                        );

                      const isToday =
                        isSameDay(
                          date,
                          today,
                        );

                      const allowed =
                        isDateAllowed(date);

                      return (
                        <Pressable
                          key={date.toISOString()}
                          disabled={!allowed}
                          onPress={() =>
                            selectDate(date)
                          }
                          style={styles.dayCell}
                        >
                          <View
                            style={[
                              styles.day,
                              isToday &&
                              styles.today,
                              selected &&
                              styles.selectedDay,
                              !allowed &&
                              styles.disabledDay,
                            ]}
                          >
                            <Text
                              style={[
                                styles.dayText,
                                selected &&
                                styles.selectedDayText,
                                isToday &&
                                styles.todayText,
                                !allowed &&
                                styles.disabledDayText,
                              ]}
                            >
                              {date.getDate()}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    },
                  )}
                </View>

                {/* FOOTER */}

                <View style={styles.footer}>
                  <Pressable
                    onPress={closePicker}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelText}>
                      Cancel
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      if (
                        isDateAllowed(today)
                      ) {
                        selectDate(today);
                      }
                    }}
                    style={styles.todayButton}
                  >
                    <Text
                      style={
                        styles.todayButtonText
                      }
                    >
                      Today
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                {/* ===================================== */}
                {/* MONTH + YEAR                           */}
                {/* ===================================== */}

                <View style={styles.selectorHeader}>

                  <Pressable
                    onPress={() => {
                      const index =
                        years.indexOf(
                          pickerYear,
                        );

                      if (index > 0 && years[index - 1] !== undefined) {
                        const year = years[index - 1];

                        if (year !== undefined) {
                          setPickerYear(year);
                        }
                      }
                    }}
                    style={styles.navButton}
                  >
                    <Text style={styles.navText}>
                      ‹
                    </Text>
                  </Pressable>

                  <Text style={styles.yearTitle}>
                    {pickerYear}
                  </Text>

                  <Pressable
                    onPress={() => {
                      const index =
                        years.indexOf(
                          pickerYear,
                        );

                      if (
                        index >= 0 &&
                        index <
                        years.length - 1
                      ) {
                        const year = years[index - 1];

                        if (year !== undefined) {
                          setPickerYear(year);
                        }
                      }
                    }}
                    style={styles.navButton}
                  >
                    <Text style={styles.navText}>
                      ›
                    </Text>
                  </Pressable>

                </View>

                {/* YEAR LIST */}

                <ScrollView
                  style={styles.yearList}
                  contentContainerStyle={
                    styles.yearContent
                  }
                  showsVerticalScrollIndicator={
                    false
                  }
                >
                  {years.map(year => {
                    const selected =
                      year === pickerYear;

                    return (
                      <Pressable
                        key={year}
                        onPress={() =>
                          selectYear(year)
                        }
                        style={[
                          styles.yearItem,
                          selected &&
                          styles.selectedYear,
                        ]}
                      >
                        <Text
                          style={[
                            styles.yearText,
                            selected &&
                            styles.selectedYearText,
                          ]}
                        >
                          {year}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* MONTHS */}

                <View style={styles.monthSection}>
                  <Text style={styles.sectionTitle}>
                    Select month
                  </Text>

                  <View style={styles.monthGrid}>
                    {MONTHS.map(
                      (month, index) => {
                        const selected =
                          index ===
                          displayMonth &&
                          pickerYear ===
                          displayYear;

                        const enabled =
                          canNavigateToMonth(
                            pickerYear,
                            index,
                            minDate,
                            maxDate,
                          );

                        return (
                          <Pressable
                            key={month}
                            disabled={!enabled}
                            onPress={() =>
                              selectMonth(
                                index,
                              )
                            }
                            style={[
                              styles.monthItem,
                              !enabled &&
                              styles.disabledMonth,
                            ]}
                          >
                            <View
                              style={[
                                styles.monthCircle,
                                selected &&
                                styles.selectedMonth,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.monthText,
                                  selected &&
                                  styles.selectedMonthText,
                                  !enabled &&
                                  styles.disabledMonthText,
                                ]}
                              >
                                {month.slice(
                                  0,
                                  3,
                                )}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      },
                    )}
                  </View>
                </View>

                {/* BACK */}

                <View style={styles.footer}>
                  <Pressable
                    onPress={() =>
                      setMode('calendar')
                    }
                    style={styles.cancelButton}
                  >
                    <Text
                      style={styles.cancelText}
                    >
                      Back
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

/* ===================================================== */
/* HELPERS                                               */
/* ===================================================== */

function parseDate(
  value?: Date | string | null,
): Date | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return isNaN(value.getTime())
      ? undefined
      : value;
  }

  const date = new Date(value);

  return isNaN(date.getTime())
    ? undefined
    : date;
}

function startOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
}

function isSameDay(
  a: Date,
  b: Date,
): boolean {
  return (
    a.getFullYear() ===
    b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDisplayDate(
  date: Date,
): string {
  return date.toLocaleDateString(
    'en-GB',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  );
}

function formatLongDate(
  date: Date,
): string {
  return date.toLocaleDateString(
    'en-GB',
    {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    },
  );
}

function createCalendarDays(
  year: number,
  month: number,
): Array<Date | null> {
  const firstDay = new Date(
    year,
    month,
    1,
  ).getDay();

  const daysInMonth = new Date(
    year,
    month + 1,
    0,
  ).getDate();

  const days: Array<Date | null> = [];

  for (
    let i = 0;
    i < firstDay;
    i++
  ) {
    days.push(null);
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day++
  ) {
    days.push(
      new Date(
        year,
        month,
        day,
      ),
    );
  }

  return days;
}

function createYears(
  minDate?: Date,
  maxDate?: Date,
): number[] {
  const currentYear =
    new Date().getFullYear();

  const minYear =
    minDate?.getFullYear() ??
    currentYear - 100;

  const maxYear =
    maxDate?.getFullYear() ??
    currentYear + 20;

  const result: number[] = [];

  for (
    let year = minYear;
    year <= maxYear;
    year++
  ) {
    result.push(year);
  }

  return result;
}

function canNavigateToMonth(
  year: number,
  month: number,
  minDate?: Date,
  maxDate?: Date,
): boolean {
  const firstDay = new Date(
    year,
    month,
    1,
  );

  const lastDay = new Date(
    year,
    month + 1,
    0,
  );

  if (
    minDate &&
    lastDay < startOfDay(minDate)
  ) {
    return false;
  }

  if (
    maxDate &&
    firstDay > startOfDay(maxDate)
  ) {
    return false;
  }

  return true;
}

/* ===================================================== */
/* STYLES                                                */
/* ===================================================== */

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },

  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },

  required: {
    color: '#EF4444',
  },

  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  inputPressed: {
    borderColor: '#2563EB',
  },

  inputDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },

  inputText: {
    fontSize: 15,
    color: '#111827',
  },

  placeholder: {
    color: '#9CA3AF',
  },

  calendarIcon: {
    fontSize: 18,
  },

  overlay: {
    flex: 1,
    backgroundColor:
      'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },

  modal: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
  },

  header: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    flexDirection: 'row',
  },

  headerLabel: {
    fontSize: 13,
    color: '#DBEAFE',
    marginBottom: 6,
  },

  headerDate: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  closeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeText: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '300',
  },

  monthHeader: {
    height: 60,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  monthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },

  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },

  arrow: {
    marginLeft: 6,
    fontSize: 16,
    color: '#6B7280',
  },

  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  navText: {
    fontSize: 28,
    lineHeight: 30,
    color: '#111827',
  },

  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    marginBottom: 4,
  },

  weekDay: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },

  calendar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    paddingBottom: 10,
  },

  dayCell: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  day: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dayText: {
    fontSize: 14,
    color: '#374151',
  },

  selectedDay: {
    backgroundColor: '#2563EB',
  },

  selectedDayText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  today: {
    borderWidth: 1,
    borderColor: '#2563EB',
  },

  todayText: {
    color: '#2563EB',
    fontWeight: '700',
  },

  disabledDay: {
    opacity: 0.3,
  },

  disabledDayText: {
    color: '#9CA3AF',
  },

  selectorHeader: {
    height: 60,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  yearTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },

  yearList: {
    maxHeight: 170,
  },

  yearContent: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  yearItem: {
    width: '25%',
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },

  selectedYear: {
    backgroundColor: '#EFF6FF',
  },

  yearText: {
    fontSize: 14,
    color: '#374151',
  },

  selectedYearText: {
    color: '#2563EB',
    fontWeight: '700',
  },

  monthSection: {
    paddingHorizontal: 14,
    paddingTop: 8,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },

  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  monthItem: {
    width: '25%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  monthCircle: {
    width: 54,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  selectedMonth: {
    backgroundColor: '#2563EB',
  },

  monthText: {
    fontSize: 13,
    color: '#374151',
  },

  selectedMonthText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  disabledMonth: {
    opacity: 0.35,
  },

  disabledMonthText: {
    color: '#9CA3AF',
  },

  footer: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },

  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },

  todayButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },

  todayButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
});