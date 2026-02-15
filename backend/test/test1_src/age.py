def categorize_by_age(age):
    if age >= 0 and age <= 9:
        return "Child"
    elif age > 9 and age <= 18:
        return "Adolescent"
    elif age > 18 and age <= 65:
        return "Adult"
    elif age > 65 and age <= 150:
        return "Golden age"
    else:
        return "Invalid age: %s" % age

if __name__ == "__main__":
    print categorize_by_age(5)
