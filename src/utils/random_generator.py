import random

def random_range(n):
    lower=10**(n-1)
    higher=(10**n)-1
    return str(random.randint(lower, higher))