package utils

func Ptr[T any](v T) *T {
	return &v
}

func ValueOrZero[T any](v *T) T {
	if v == nil {
		return *new(T)
	} else {
		return *v
	}
}

type integer interface {
	~int | ~int8 | ~int16 | ~int32 | ~int64 | ~uint | ~uint8 | ~uint16 | ~uint32 | ~uint64
}

func ConvertPtr[U, T integer](v *T) *U {
	if v == nil {
		return nil
	}

	return Ptr(U(*v))
}

func PtrEqual[T comparable](a, b *T) bool {
	if a == nil || b == nil {
		return a == b
	}

	return *a == *b
}

func SetNilIfZero[T comparable](value **T) {
	if value != nil && *value != nil && **value == *new(T) {
		*value = nil
	}
}

func Slice[T any](v ...T) []T {
	return v
}

func Exists[T comparable](v []T, el T) bool {
	for _, e := range v {
		if e == el {
			return true
		}
	}

	return false
}

func ExistsMap[T any, U comparable](v []T, el U, mapper func(T) U) bool {
	for _, e := range v {
		mapped := mapper(e)
		if mapped == el {
			return true
		}
	}

	return false
}

func FindMap[T any, U comparable](v []T, el U, mapper func(T) U) *T {
	for _, e := range v {
		mapped := mapper(e)
		if mapped == el {
			return &e
		}
	}

	return nil
}

func Must(err error) {
	if err != nil {
		panic(err)
	}
}
